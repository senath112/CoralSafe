'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input'; // Import Input
import { Label } from '@/components/ui/label'; // Import Label
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { cn, defineSensorDataThresholds, analyzeSensorData, calculateSuitabilityIndex } from '@/lib/utils'; // Import cn
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from '@/components/ui/chart';
import type { ChartConfig } from "@/components/ui/chart";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend as RechartsLegend, ResponsiveContainer, AreaChart, Area, Bar, Cell } from 'recharts'; // Added Bar, Cell
import { Progress } from "@/components/ui/progress";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import * as tf from '@tensorflow/tfjs'; // Still needed for tf.dispose
import { useToast } from "@/hooks/use-toast";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
} from "@/components/ui/table";
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import Link from 'next/link';
import { Fish, Waves, Droplet, Thermometer, Beaker, Wind, CloudFog, Activity, Gauge, Loader2, ArrowDownUp, MapPin, TrendingUp, BarChartBig, LocateFixed } from 'lucide-react'; // Added LocateFixed
// Import functions from the prediction model file
import { trainPredictionModel, generatePredictions, type NormalizationParams } from '@/lib/prediction-model';
import dynamic from 'next/dynamic'; // Import dynamic
import { getLocationName } from '@/ai/flows/get-location-name'; // Import the new flow
import { parse } from 'date-fns'; // Import date-fns


// Dynamically import visualization components to avoid SSR issues
const DepthVisualization = dynamic(() => import('@/components/DepthVisualization'), { ssr: false });


// Keep these interfaces here or move them to a central types file (e.g., src/types.ts)
export interface SensorData {
  time: string; // Keep as string initially
  location: string;
  waterTemperature: number;
  salinity: number;
  pHLevel: number;
  dissolvedOxygen: number;
  turbidity: number;
  nitrate: number;
}

export interface AnalysisResult extends SensorData {
  isSuitable: boolean | null;
  summary?: string;
  improvements?: string[];
  suitabilityIndex?: number;
  isPrediction?: boolean;
}


// Keep thresholds and parameters definition here or move to utils/config
const sensorDataThresholds = defineSensorDataThresholds();

const parameters = [
  { name: 'Water Temperature', key: 'waterTemperature', unit: '°C', icon: Thermometer },
  { name: 'Salinity', key: 'salinity', unit: 'PSU', icon: Waves },
  { name: 'pH Level', key: 'pHLevel', unit: '', icon: Beaker },
  { name: 'Dissolved Oxygen', key: 'dissolvedOxygen', unit: 'mg/L', icon: Wind },
  { name: 'Turbidity', key: 'turbidity', unit: 'NTU', icon: CloudFog },
  { name: 'Nitrate', key: 'nitrate', unit: 'mg/L', icon: Droplet },
];

const chartConfig: ChartConfig = {
  waterTemperature: { label: "Water Temp (°C)", color: "hsl(var(--chart-1))", icon: Thermometer },
  salinity: { label: "Salinity (PSU)", color: "hsl(var(--chart-2))", icon: Waves },
  pHLevel: { label: "pH Level", color: "hsl(var(--chart-3))", icon: Beaker },
  dissolvedOxygen: { label: "Dissolved Oxygen (mg/L)", color: "hsl(var(--chart-4))", icon: Wind },
  turbidity: { label: "Turbidity (NTU)", color: "hsl(var(--chart-5))", icon: CloudFog },
  nitrate: { label: "Nitrate (mg/L)", color: "hsl(var(--accent))", icon: Droplet }, // Use accent for nitrate line
  suitabilityIndex: { label: "Suitability Index", color: "hsl(var(--primary))", icon: TrendingUp }, // Added Suitability Index
  prediction: { label: "Prediction", color: "hsl(var(--muted-foreground))", icon: () => <path d="M3 3v18h18" fill="none" strokeDasharray="5 5" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" className="stroke-muted-foreground" /> },
} satisfies ChartConfig;

// --- Helper function to generate gradient definitions for Area fills ---
const renderGradientDefs = (config: ChartConfig, parameters: { key: string }[]) => {
  const gradientIds = new Set<string>(); // Track generated IDs to avoid duplicates

  const suitabilityGradientId = 'suitabilityGradient';
  const predictionGradientId = 'predictionGradient';

  gradientIds.add(suitabilityGradientId);
  gradientIds.add(predictionGradientId);

  parameters.forEach(param => {
    gradientIds.add(`${param.key}Gradient`);
  });

  return (
    <svg style={{ height: 0, width: 0, position: 'absolute' }}>
      <defs>
        {/* Suitability Gradient */}
        <linearGradient id={suitabilityGradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="5%" stopColor={config.suitabilityIndex?.color || 'hsl(var(--primary))'} stopOpacity={0.8} />
          <stop offset="95%" stopColor={config.suitabilityIndex?.color || 'hsl(var(--primary))'} stopOpacity={0.2} />
        </linearGradient>

        {/* Prediction Gradient */}
        <linearGradient id={predictionGradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="5%" stopColor={config.prediction.color} stopOpacity={0.5} />
          <stop offset="95%" stopColor={config.prediction.color} stopOpacity={0.1} />
        </linearGradient>

        {/* Parameter Gradients */}
        {parameters.map((parameter) => {
          const paramConfig = config[parameter.key];
          if (!paramConfig || !paramConfig.color) return null;
          const gradientId = `${parameter.key}Gradient`;
          return (
            <linearGradient key={gradientId} id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={paramConfig.color} stopOpacity={0.6} /> {/* Slightly less opaque fill */}
              <stop offset="95%" stopColor={paramConfig.color} stopOpacity={0.1} />
            </linearGradient>
          );
        })}
      </defs>
    </svg>
  );
};
// --- End Helper function ---

export default function Home() {
  const [sensorData, setSensorData] = useState<string>('');
  const [analysisResults, setAnalysisResults] = useState<AnalysisResult[]>([]);
  const [trainedModelInfo, setTrainedModelInfo] = useState<{ model: tf.Sequential; normParams: NormalizationParams } | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [analysisProgress, setAnalysisProgress] = useState<number>(0);
  const { toast } = useToast();

  const csvDataRef = useRef<string>(''); // Keep ref for PDF generation if needed
  const reportRef = useRef<HTMLDivElement>(null);

  const [startTime, setStartTime] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState<number>(0);
  const [remainingTimeText, setRemainingTimeText] = useState<string>('');

  // State for new inputs
  const [latitude, setLatitude] = useState<string>('');
  const [longitude, setLongitude] = useState<string>('');
  const [depth, setDepth] = useState<string>('');
  const [isFetchingLocation, setIsFetchingLocation] = useState<boolean>(false); // State for location fetching

  // State to store values after analysis starts
  const [analyzedLatitude, setAnalyzedLatitude] = useState<number | null>(null);
  const [analyzedLongitude, setAnalyzedLongitude] = useState<number | null>(null);
  const [analyzedDepth, setAnalyzedDepth] = useState<number | null>(null);
  const [identifiedLocationName, setIdentifiedLocationName] = useState<string | null>(null); // State for location name

  // For time estimation
  const progressRef = useRef<{ time: number; progress: number }[]>([]);
  // Ref to store the previous remaining time estimate for smoothing
  const remainingTimeRef = useRef<number | null>(null);
  const lastProgressRef = useRef<number>(0); // Track last progress update


   useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null;

    if (isLoading && startTime !== null) {
        intervalId = setInterval(() => {
            const now = Date.now();
            const elapsed = now - startTime;
            setElapsedTime(elapsed);

            const currentProgress = analysisProgress; // Use the state directly

            // Store current progress and time ONLY IF progress increased
            if (currentProgress > lastProgressRef.current) {
                progressRef.current.push({ time: elapsed, progress: currentProgress });
                lastProgressRef.current = currentProgress; // Update last known progress
                // Keep only recent history (e.g., last 10 seconds)
                const historyCutoff = elapsed - 10000;
                progressRef.current = progressRef.current.filter(p => p.time >= historyCutoff);
            }


            let remainingTimeMs = -1; // -1 indicates insufficient data or completion

             if (currentProgress > 0 && currentProgress < 100 && progressRef.current.length > 1) {
                 const firstPoint = progressRef.current[0];
                 const lastPoint = progressRef.current[progressRef.current.length - 1];
                 const progressDelta = lastPoint.progress - firstPoint.progress;
                 const timeDelta = lastPoint.time - firstPoint.time;

                 if (progressDelta > 0 && timeDelta > 500) { // Ensure some time passed and progress made
                     const progressRate = progressDelta / timeDelta; // progress per millisecond
                     const remainingProgress = 100 - currentProgress;
                     remainingTimeMs = remainingProgress / progressRate;
                 }
             }

             // Smoothing the remaining time estimate
             const previousEstimate = remainingTimeRef.current;
             const alpha = 0.1; // Smoothing factor (0 < alpha <= 1)
             if (remainingTimeMs > 0 && previousEstimate !== null) {
                 remainingTimeMs = alpha * remainingTimeMs + (1 - alpha) * previousEstimate;
             }
             // Don't let the estimate drop below 0 if it was positive before
             remainingTimeRef.current = remainingTimeMs > 0 ? remainingTimeMs : null;


            if (remainingTimeMs > 0) {
                const remainingSeconds = Math.max(0, Math.round(remainingTimeMs / 1000));
                const minutes = Math.floor(remainingSeconds / 60);
                const seconds = remainingSeconds % 60;

                let timeString = '';
                if (minutes > 0) {
                    timeString = `~${minutes}m ${seconds}s left`;
                } else if (seconds > 1) { // Only show seconds if more than 1
                    timeString = `~${seconds}s left`;
                } else if (currentProgress < 100) { // Show finishing up only if not yet 100%
                   timeString = 'Finishing up...';
                } else {
                    timeString = ''; // Clear if already 100%
                }
                setRemainingTimeText(timeString);

            } else if (currentProgress === 0) {
                setRemainingTimeText('Starting analysis...');
            } else if (currentProgress >= 100) {
                setRemainingTimeText('Analysis complete!');
                if (intervalId) clearInterval(intervalId); // Stop interval when complete
            } else {
                // If calculation failed or progress is stuck but not complete
                 setRemainingTimeText('Calculating time...');
            }
        }, 500); // Check every 500ms for smoother updates
    } else {
        setElapsedTime(0);
        progressRef.current = []; // Clear history when not loading
        remainingTimeRef.current = null; // Clear estimate when not loading
        lastProgressRef.current = 0; // Reset last progress
        if (analysisProgress === 100 && !isLoading) {
            setRemainingTimeText('Analysis complete!');
        } else {
            setRemainingTimeText(''); // Clear text if stopped/not started
        }
    }

    return () => {
        if (intervalId) {
            clearInterval(intervalId);
        }
    };
  }, [isLoading, startTime, analysisProgress]); // analysisProgress is crucial here


  const downloadReport = () => {
    const input = reportRef.current;
    if (!input) {
      toast({
        title: 'Error',
        description: 'Report element not found.',
        variant: 'destructive',
      });
      return;
    }

    // --- Temporarily change text colors for PDF generation ---
    const originalColors = new Map<HTMLElement | SVGTextElement | SVGTSpanElement, string>();
    // Query for specific elements likely to have text, excluding those with specific background classes
    const elementsToColor = input.querySelectorAll<HTMLElement | SVGTextElement | SVGTSpanElement>(
        'p, span, h1, h2, h3, h4, h5, h6, li, th, td, code, div:not([class*="bg-"]):not([class*="dark:bg-"]), text, tspan'
        // The :not selectors try to exclude elements that *already* have a background color,
        // assuming those elements handle their own contrast (like the suitability badges)
        // Adjust this selector if needed based on your component structure
    );


    elementsToColor.forEach(el => {
      // Check if the element itself or an ancestor has a specific background class we want to ignore
      let ignoreColorChange = false;
      let currentEl: Element | null = el;
      while (currentEl && currentEl !== input) {
        if (currentEl.classList.contains('bg-green-200') ||
            currentEl.classList.contains('bg-yellow-200') ||
            currentEl.classList.contains('bg-red-200') ||
            currentEl.classList.contains('bg-gray-200') || // Include prediction bg
            currentEl.classList.contains('dark:bg-green-800/50') ||
            currentEl.classList.contains('dark:bg-yellow-800/50') ||
            currentEl.classList.contains('dark:bg-red-800/50') ||
            currentEl.classList.contains('dark:bg-gray-700') || // Include prediction dark bg
            currentEl.closest('.recharts-tooltip-wrapper') || // Ignore tooltips
            currentEl.closest('header')) { // Ignore header
          ignoreColorChange = true;
          break;
        }
        currentEl = currentEl.parentElement;
      }


      if (!ignoreColorChange) {
        // Store original style (color for HTML, fill for SVG text)
        originalColors.set(el, el.style.color || el.style.fill);

        // Apply black color/fill
        if (el instanceof SVGTextElement || el instanceof SVGTSpanElement) {
           el.style.setProperty('fill', 'black', 'important'); // Force fill for SVG text
           el.style.color = ''; // Reset color just in case
        } else if (el instanceof HTMLElement) {
            el.style.setProperty('color', 'black', 'important'); // Force color for HTML elements
            el.style.fill = ''; // Reset fill just in case
        }
      }
    });
    // --- End temporary color change ---


    const summaryTriggers = Array.from(input.querySelectorAll<HTMLButtonElement>('[data-summary-trigger]'));
    const summaryContents = Array.from(input.querySelectorAll<HTMLElement>('[data-summary-content]'));
    const actionsTriggers = Array.from(input.querySelectorAll<HTMLButtonElement>('[data-actions-trigger]'));
    const actionsContents = Array.from(input.querySelectorAll<HTMLElement>('[data-actions-content]'));
    const graphTriggers = Array.from(input.querySelectorAll<HTMLButtonElement>('[data-graph-trigger]')); // Select graph triggers
    const graphContents = Array.from(input.querySelectorAll<HTMLElement>('[data-graph-content]')); // Select graph content


    const originalStates = new Map<Element, string | null>();

    const setState = (elements: Element[], state: 'open' | 'closed') => {
      elements.forEach(el => {
        if (!originalStates.has(el)) {
          originalStates.set(el, el.getAttribute('data-state'));
        }
        el.setAttribute('data-state', state);
      });
    };

    // Default to expanded for PDF
    setState(summaryTriggers, 'open');
    setState(summaryContents, 'open');
    setState(actionsTriggers, 'open');
    setState(actionsContents, 'open');
    setState(graphTriggers, 'open'); // Expand graphs
    setState(graphContents, 'open'); // Expand graphs

    // Ensure accordion content is fully visible before capturing
    setTimeout(() => {
      html2canvas(input, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff', // Force white background for PDF
         scrollY: -window.scrollY, // Attempt to capture from the top
         windowWidth: document.documentElement.offsetWidth,
         windowHeight: document.documentElement.offsetHeight,
         // Explicitly set width/height if needed, though scrollY should help
         // width: input.scrollWidth,
         // height: input.scrollHeight
      })
        .then((canvas) => {
          const imgData = canvas.toDataURL('image/png');
          const pdf = new jsPDF('p', 'mm', 'a4');
          const pdfWidth = pdf.internal.pageSize.getWidth();
          const pdfHeight = pdf.internal.pageSize.getHeight();
          const imgProps = pdf.getImageProperties(imgData);
          const imgWidth = pdfWidth - 20; // Add 10mm margin on each side
          const imgHeight = (imgProps.height * imgWidth) / imgProps.width;
          let heightLeft = imgHeight;
          let position = 10; // Start 10mm from the top

          pdf.addImage(imgData, 'PNG', 10, position, imgWidth, imgHeight);
          heightLeft -= (pdfHeight - 20); // Subtract available height (page height - top/bottom margins)

          while (heightLeft > 0) {
            position = position - (pdfHeight - 20); // Move position up by available height for next page
            pdf.addPage();
            pdf.addImage(imgData, 'PNG', 10, position, imgWidth, imgHeight);
            heightLeft -= (pdfHeight - 20);
          }


          pdf.save('coral_safe_report.pdf');
          toast({
            title: 'Success',
            description: 'Report downloaded successfully!',
          });
        })
        .catch((error) => {
          console.error('Error generating PDF:', error);
          toast({
            title: 'Error',
            description: 'Failed to generate PDF. Check console for details.',
            variant: 'destructive',
          });
        })
        .finally(() => {
           // --- Restore original colors ---
           elementsToColor.forEach((el, key) => {
             const originalStyle = originalColors.get(key);
              if (el instanceof SVGTextElement || el instanceof SVGTSpanElement) {
                // Check if original style was null/undefined/empty string for fill
                 if (originalStyle === null || originalStyle === undefined || originalStyle === '') {
                    el.style.removeProperty('fill'); // Remove the forced black fill
                 } else {
                    el.style.setProperty('fill', originalStyle); // Restore original fill
                 }
              } else if (el instanceof HTMLElement) {
                 // Check if original style was null/undefined/empty string for color
                  if (originalStyle === null || originalStyle === undefined || originalStyle === '') {
                    el.style.removeProperty('color'); // Remove the forced black color
                  } else {
                     el.style.setProperty('color', originalStyle); // Restore original color
                  }
              }
           });
          // --- End restoring colors ---


          // Restore original accordion states
          originalStates.forEach((state, el) => {
            if (state) {
              el.setAttribute('data-state', state);
            } else {
              el.removeAttribute('data-state');
            }
          });
        });
    }, 250); // Increased timeout slightly more for rendering complex content like graphs
  };


  const parseData = (data: string): SensorData[] => {
    console.log("Parsing data...");
    const lines = data.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    if (lines.length < 2) {
      console.warn("No data rows found after header.");
      return [];
    }
    // Assuming the first line is the header and skipping it
    const headerLine = lines[0].toLowerCase();
    const dataLines = lines.slice(1);

    // Basic header check (optional but recommended)
    const expectedHeaders = ['date', 'location', 'water_temperature_c', 'salinity_psu', 'ph_level', 'dissolved_oxygen_mg_l', 'turbidity_ntu', 'nitrate_mg_l'];
    const actualHeaders = headerLine.split(',').map(h => h.trim());
    if (actualHeaders.length !== expectedHeaders.length || !expectedHeaders.every((h, i) => actualHeaders[i].includes(h))) {
      console.warn("CSV header doesn't match expected format exactly. Proceeding, but results might be inaccurate. Expected:", expectedHeaders, "Got:", actualHeaders);
      // Consider throwing an error or showing a toast if strict format is required
      // toast({
      //   title: 'Warning',
      //   description: 'CSV header format seems incorrect. Analysis might be inaccurate.',
      //   variant: 'destructive', // Use destructive variant for warnings? Or create a 'warning' variant
      // });
    }


    const parsedEntries = dataLines.map((entry, index) => {
      console.log(`Parsing line ${index + 2}: ${entry}`); // Line number includes header
      const parts = entry.split(',').map(item => item.trim());
      if (parts.length !== expectedHeaders.length) {
        console.warn(`Skipping incomplete or malformed entry (line ${index + 2}): ${entry}`);
        return null;
      }

      const [date, location, waterTemperature, salinity, pHLevel, dissolvedOxygen, turbidity, nitrate] = parts;

      const waterTemperatureNum = parseFloat(waterTemperature);
      const salinityNum = parseFloat(salinity);
      const pHLevelNum = parseFloat(pHLevel);
      const dissolvedOxygenNum = parseFloat(dissolvedOxygen);
      const turbidityNum = parseFloat(turbidity);
      const nitrateNum = parseFloat(nitrate);

      if (
        !date || !location || // Check if date and location are present
        isNaN(waterTemperatureNum) ||
        isNaN(salinityNum) ||
        isNaN(pHLevelNum) ||
        isNaN(dissolvedOxygenNum) ||
        isNaN(turbidityNum) ||
        isNaN(nitrateNum)
      ) {
        console.warn(`Skipping entry with invalid or missing values (line ${index + 2}): ${entry}`);
        return null;
      }

      return {
        time: date, // Keep original date string
        location: location,
        waterTemperature: waterTemperatureNum,
        salinity: salinityNum,
        pHLevel: pHLevelNum,
        dissolvedOxygen: dissolvedOxygenNum,
        turbidity: turbidityNum,
        nitrate: nitrateNum,
      };
    }).filter((item): item is SensorData => item !== null); // Type guard to filter out nulls
    console.log("Parsing completed. Parsed entries:", parsedEntries);
    return parsedEntries;
  };

  const analyzeData = useCallback(async () => {
    console.log("analyzeData function called.");
    console.log("Current sensor data state:", sensorData);
    if (!sensorData.trim()) {
      console.log("Sensor data is empty. Aborting analysis.");
      toast({
        title: 'Input Error',
        description: 'Please paste sensor data before analyzing.',
        variant: 'destructive',
      });
      return;
    }

     // Validate Latitude, Longitude, and Depth
     const latNum = parseFloat(latitude);
     const lonNum = parseFloat(longitude);
     const depthNum = parseFloat(depth);

     if (isNaN(latNum) || latNum < -90 || latNum > 90) {
        toast({ title: 'Input Error', description: 'Invalid Latitude. Must be between -90 and 90.', variant: 'destructive' });
        return;
     }
     if (isNaN(lonNum) || lonNum < -180 || lonNum > 180) {
        toast({ title: 'Input Error', description: 'Invalid Longitude. Must be between -180 and 180.', variant: 'destructive' });
        return;
     }
     if (isNaN(depthNum) || depthNum < 0) {
       toast({ title: 'Input Error', description: 'Invalid Depth. Must be a non-negative number.', variant: 'destructive' });
       return;
     }

    setIsLoading(true);
    setAnalysisProgress(0); // Reset progress
    setAnalysisResults([]);
    progressRef.current = []; // Clear progress history
    lastProgressRef.current = 0; // Reset last progress ref
    setStartTime(Date.now());
    setTrainedModelInfo(null); // Clear previous model
    setIdentifiedLocationName(null); // Clear previous location name
    remainingTimeRef.current = null; // Clear remaining time estimate
    setRemainingTimeText('Initializing...'); // Initial time text
    console.log("Set loading state, cleared previous results/model, recorded start time.");
    csvDataRef.current = sensorData; // Store raw CSV data for PDF

    // Store submitted location and depth data
    setAnalyzedLatitude(latNum);
    setAnalyzedLongitude(lonNum);
    setAnalyzedDepth(depthNum);

    let trainingResult: { model: tf.Sequential; normParams: NormalizationParams } | null = null;
    let normParamsToDispose: NormalizationParams | null = null; // Track normParams for disposal

    // Use requestAnimationFrame for smoother progress updates
    let frameId: number | null = null;
    const updateProgressSmoothly = (targetProgress: number) => {
        // Ensure progress doesn't go backwards and stays within 0-100
        const currentProg = lastProgressRef.current; // Use ref for current state to avoid stale closure
        const clampedTarget = Math.max(currentProg, Math.min(targetProgress, 100));

        // If already at or beyond target, just update state and ref
        if (currentProg >= clampedTarget) {
            if (currentProg !== analysisProgress) { // Only update state if different
                 setAnalysisProgress(currentProg);
            }
            return;
        }


        const step = (timestamp: number) => {
           const newProgress = Math.min(lastProgressRef.current + 1, clampedTarget); // Increment by 1 or up to target
           lastProgressRef.current = newProgress;
           setAnalysisProgress(newProgress);

           if (newProgress < clampedTarget) {
               frameId = requestAnimationFrame(step);
           } else {
               frameId = null; // Animation finished
           }
       };

        if (frameId === null) { // Start animation only if not already running
           frameId = requestAnimationFrame(step);
        }
    };


    try {
      // --- Get Location Name ---
      updateProgressSmoothly(1);
      try {
        console.log(`Getting location name for Lat: ${latNum}, Lon: ${lonNum}`);
        const locationResult = await getLocationName({ latitude: latNum, longitude: lonNum });
        setIdentifiedLocationName(locationResult.locationName);
        console.log("Identified location name:", locationResult.locationName);
        toast({ title: 'Location Identified', description: `Location identified as: ${locationResult.locationName}` });
      } catch (locationError: any) {
        console.error("Error getting location name:", locationError);
        setIdentifiedLocationName("Unknown Location"); // Set to unknown if error
        toast({ title: 'Location Error', description: `Could not identify location name: ${locationError.message}`, variant: 'destructive' });
      }
      updateProgressSmoothly(5); // Location lookup complete


      console.log("Parsing sensor data...");
      // updateProgressSmoothly(5); // Start progress smoothly - Already done above
      await new Promise(resolve => setTimeout(resolve, 100)); // Simulate parsing time & allow UI update
      const parsedData = parseData(sensorData);
      console.log("Parsed data:", parsedData);

      if (!parsedData || parsedData.length === 0) {
        console.log("No valid data after parsing.");
        toast({
          title: 'Error',
          description: 'No valid data found or data format is incorrect. Check headers and numeric values.',
          variant: 'destructive',
        });
        setIsLoading(false);
        setStartTime(null);
        setAnalysisProgress(0); // Reset progress on error
        setRemainingTimeText(''); // Clear time text
        return;
      }
      updateProgressSmoothly(10); // Parsing complete

      // --- Train Model ---
      console.log("Training model using prediction-model.ts...");
      updateProgressSmoothly(15); // Start training progress
      await new Promise(resolve => setTimeout(resolve, 100)); // Simulate start time

      const trainingStartTime = Date.now(); // Track training time separately
      trainingResult = await trainPredictionModel(parsedData, (epochProgress) => {
        // Update progress based on training epochs (15% to 45%)
        updateProgressSmoothly(15 + Math.floor(epochProgress * 30));
      });
      const trainingEndTime = Date.now();
      console.log(`Model training took ${(trainingEndTime - trainingStartTime) / 1000}s`);

      setTrainedModelInfo(trainingResult); // Save the trained model and norm params
      if (trainingResult) {
        normParamsToDispose = trainingResult.normParams; // Store normParams for later disposal
      }
      updateProgressSmoothly(45); // Training complete

      // --- Analyze Data Points ---
      console.log("Analyzing each data point for suitability...");
      updateProgressSmoothly(50); // Start analysis progress
      await new Promise(resolve => setTimeout(resolve, 100)); // Simulate start time

      const analysisStartTime = Date.now();
      let detailedResults: AnalysisResult[] = parsedData.map((data, index) => {
        console.log(`Analyzing data point ${index}:`, data);
        const { isSuitable, summary, threateningFactors } = analyzeSensorData(
          data,
          sensorDataThresholds
        );
        const suitabilityIndex = calculateSuitabilityIndex(data, sensorDataThresholds);
        console.log(`Analysis for point ${index}: Suitable - ${isSuitable}, Index - ${suitabilityIndex}`);

        let improvements: string[] = [];
        // Check threatening factors first, then cautions
         const specificThreats = Object.entries(threateningFactors)
              .filter(([_, value]) => value) // Filter where the value is true (threatening)
              .map(([key]) => {
                   switch (key) {
                        case 'temperature': return `High/low water temperature detected. Consider measures to stabilize or shade if applicable.`;
                        case 'salinity': return `Salinity is outside safe range. Identify and address sources of freshwater influx or excessive evaporation.`;
                        case 'pHLevel': return `pH level is critically low (acidification). Investigate causes like CO2 absorption or pollution.`;
                        case 'dissolvedOxygen': return `Dissolved oxygen is dangerously low (hypoxia). Enhance water circulation or aeration; reduce organic load.`;
                        case 'turbidity': return `Turbidity is very high, blocking light. Address sediment runoff, dredging activities, or algal blooms.`;
                        case 'nitrate': return `Nitrate level is critically high, risking algal blooms. Control nutrient sources from runoff or sewage.`;
                        default: return `Address critical issues related to ${key}.`;
                    }
              });

         if (specificThreats.length > 0) {
             improvements = specificThreats; // Focus on threats first
         } else { // No threats, check for cautions
              const cautionsMatch = analyzeSensorData(data, sensorDataThresholds).summary.match(/caution factors: (.*?)\./);
              if (cautionsMatch && cautionsMatch[1]) {
                   const cautionParams = cautionsMatch[1].split(', ');
                   improvements = cautionParams.map(param => {
                       if (param.includes('Temp near upper limit')) return `Monitor temperature closely; it's nearing the upper caution limit.`;
                       if (param.includes('Temp near lower limit')) return `Monitor temperature closely; it's nearing the lower caution limit.`;
                       if (param.includes('Salinity in caution zone')) return `Salinity is in the caution zone. Monitor for further deviations.`;
                       if (param.includes('pH near lower limit')) return `pH is nearing the lower caution limit. Monitor for acidification trends.`;
                       if (param.includes('Dissolved oxygen low')) return `Dissolved oxygen is in the caution range. Monitor for potential hypoxia.`;
                       if (param.includes('Turbidity elevated')) return `Turbidity is elevated. Monitor water clarity and potential light reduction.`;
                       if (param.includes('Nitrate elevated')) return `Nitrate level is elevated. Monitor for potential contribution to algal growth.`;
                       return `Monitor parameter: ${param}.`; // Fallback
                   });
              } else if (isSuitable) { // Suitable and no cautions mentioned
                  improvements = ["Environment appears ideal. Continue regular monitoring."];
              } else { // Should technically be caught by specificThreats, but as a fallback
                   improvements = ["Multiple parameters are outside ideal ranges. Review all sensor data for specific issues."];
              }
         }


        // Update progress during analysis (50% to 75%)
        const currentTargetProgress = 50 + Math.floor(((index + 1) / parsedData.length) * 25);
        updateProgressSmoothly(currentTargetProgress);


        return {
          ...data,
          isSuitable, // Use the final boolean result
          summary,
          improvements, // Now an array of strings
          suitabilityIndex,
          isPrediction: false,
        };
      });
      const analysisEndTime = Date.now();
      console.log(`Data point analysis took ${(analysisEndTime - analysisStartTime) / 1000}s`);
      console.log("Finished suitability analysis for all data points.");
      updateProgressSmoothly(75); // Analysis complete

      // --- Generate Predictions ---
      if (trainingResult) {
        console.log("Generating predictions using prediction-model.ts...");
        updateProgressSmoothly(80); // Start prediction progress
        await new Promise(resolve => setTimeout(resolve, 100)); // Simulate start

        const predictionStartTime = Date.now();
        const numPredictions = 5;
        // Pass the model, normParams, and the already analyzed results
        const predictedResults = await generatePredictions(
          trainingResult.model,
          trainingResult.normParams,
          detailedResults, // Pass the current results array for sequential prediction
          numPredictions,
          (predictionProgress) => {
            // Update progress during prediction (80% to 100%)
            updateProgressSmoothly(80 + Math.floor(predictionProgress * 20));
          }
        );
        const predictionEndTime = Date.now();
        console.log(`Predictions took ${(predictionEndTime - predictionStartTime) / 1000}s`);

        // Combine original analyzed results with new predictions
        detailedResults = [...detailedResults, ...predictedResults];

        console.log("Finished predictions.");
      } else {
        console.log("Model training failed or skipped. No predictions will be made.");
        toast({
          title: "Prediction Skipped",
          description: "Model training failed or was skipped, so predictions could not be made.",
          variant: "destructive", // Consider a less alarming variant?
        });
        // If skipping predictions, jump progress to 100
        updateProgressSmoothly(100);
      }

      // Final state updates after all async operations
      updateProgressSmoothly(100); // Ensure progress reaches 100%
      console.log("Final analysis results (including predictions):", detailedResults);
      setAnalysisResults(detailedResults);
      toast({
        title: 'Success',
        description: 'Data analyzed and predictions generated successfully!',
      });

    } catch (error: any) {
      console.error('Error during analysis:', error);
      toast({
        title: 'Error',
        description: `An error occurred: ${error.message}. Check console for details.`,
        variant: 'destructive',
      });
      setAnalysisProgress(0); // Reset progress on error
      setRemainingTimeText(''); // Clear time text
    } finally {
      if (frameId) cancelAnimationFrame(frameId); // Clean up animation frame
      // Dispose the normalization parameter tensors AFTER analysis and predictions
      if (normParamsToDispose) {
        tf.dispose([normParamsToDispose.min, normParamsToDispose.max]);
        console.log("Disposed normalization parameter tensors.");
      } else {
        console.warn("Normalization parameters were null or model training failed, cannot dispose.");
      }
      console.log("Analysis process finished. Setting loading state to false.");
      setIsLoading(false);
      setStartTime(null);
      // Ensure progress is 100% visually after loading stops
       // Ensure progress visually reaches 100 only if no error occurred
       if (analysisProgress >= 99.9) { // Use a threshold to avoid floating point issues
          setAnalysisProgress(100);
          setRemainingTimeText('Analysis complete!');
       } else if (!isLoading) { // If stopped prematurely due to error
           // Keep the current progress or reset, depending on desired behavior
       }
    }
  }, [sensorData, toast, latitude, longitude, depth, analysisProgress]); // Removed analysisProgress dependency here

    // Function to get current location
  const fetchCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast({
        title: 'Geolocation Error',
        description: 'Geolocation is not supported by your browser.',
        variant: 'destructive',
      });
      return;
    }

    setIsFetchingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLatitude(position.coords.latitude.toFixed(6)); // Keep reasonable precision
        setLongitude(position.coords.longitude.toFixed(6));
        setIsFetchingLocation(false);
        toast({
          title: 'Location Fetched',
          description: 'Current latitude and longitude populated.',
        });
      },
      (error) => {
        setIsFetchingLocation(false);
        toast({
          title: 'Geolocation Error',
          description: `Failed to get location: ${error.message}`,
          variant: 'destructive',
        });
        console.error('Geolocation error:', error);
      },
      {
        enableHighAccuracy: true, // Request higher accuracy
        timeout: 10000,          // Set a timeout (10 seconds)
        maximumAge: 0            // Don't use cached location
      }
    );
  };


  return (
    <div ref={reportRef} className="flex flex-col items-center justify-start min-h-screen py-12 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-blue-300 via-blue-400 to-teal-500 text-foreground">
      {/* Render SVG Gradient Definitions */}
      {renderGradientDefs(chartConfig, parameters)}


      {/* Header Section */}
      <header className="w-full max-w-5xl mb-8 text-center text-white shadow-lg p-4 rounded-lg bg-black/30 backdrop-blur-sm flex justify-center items-center"> {/* Changed justify-between to justify-center */}
         <div className="flex items-center justify-center">
            <Fish className="w-10 h-10 mr-3 text-cyan-300 animate-pulse" />
            <div>
                 <h1 className="text-4xl font-bold">CoralGuard</h1>
                 <p className="text-lg text-cyan-100">V2.4 - Mariana</p> {/* Updated Version */}
                 <p className="mt-1 text-xs text-blue-200">
                   Made with love by Senath Sethmika
                 </p>
            </div>
          </div>
      </header>

      <div className="max-w-7xl w-full space-y-8">

        <Card className="bg-white/90 dark:bg-slate-900/90 text-foreground shadow-xl rounded-xl backdrop-blur-md border border-white/30">
          <CardHeader>
            <div className="flex items-center mb-4">
              <Avatar>
                <AvatarImage data-ai-hint="coral reef" src="https://picsum.photos/seed/coralreef/50/50" alt="CoralSafe Logo" className="border-2 border-cyan-300 rounded-full" />
                <AvatarFallback className="bg-cyan-500 text-white">CS</AvatarFallback>
              </Avatar>
              <CardTitle className="ml-4 text-2xl font-semibold text-foreground">CoralSafe: Sensor Data Analyzer</CardTitle>
            </div>

            <CardDescription className="text-muted-foreground text-sm">
               <div className="font-medium mb-1 text-foreground">Paste your CSV sensor data below.</div>
               <div className="text-foreground">Expected Format: <code className="bg-black/20 px-1 py-0.5 rounded text-xs">Date,Location,Water_Temperature_C,Salinity_PSU,pH_Level,Dissolved_Oxygen_mg_L,Turbidity_NTU,Nitrate_mg_L</code></div>
             </CardDescription>
          </CardHeader>
          <CardContent>
             {/* New Input Fields */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
               {/* Latitude Input */}
                <div>
                    <Label htmlFor="latitude" className="text-foreground flex items-center mb-1">
                        <MapPin className="w-4 h-4 mr-1 text-cyan-600 dark:text-cyan-400"/> Latitude
                    </Label>
                    <Input
                        id="latitude"
                        type="number"
                        placeholder="e.g., 6.9271"
                        value={latitude}
                        onChange={(e) => setLatitude(e.target.value)}
                        className="text-sm p-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-inner focus:ring-cyan-500 focus:border-cyan-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                    />
                </div>

                {/* Longitude Input & Fetch Button */}
                <div className="relative"> {/* Use relative positioning for button */}
                    <Label htmlFor="longitude" className="text-foreground flex items-center mb-1">
                        <MapPin className="w-4 h-4 mr-1 text-cyan-600 dark:text-cyan-400"/> Longitude
                    </Label>
                     <div className="flex items-center gap-2">
                        <Input
                            id="longitude"
                            type="number"
                            placeholder="e.g., 79.8612"
                            value={longitude}
                            onChange={(e) => setLongitude(e.target.value)}
                            className="flex-grow text-sm p-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-inner focus:ring-cyan-500 focus:border-cyan-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                        />
                        <Button
                            onClick={fetchCurrentLocation}
                            disabled={isFetchingLocation}
                            size="icon"
                            variant="outline"
                            className="p-2 border-cyan-500 text-cyan-600 hover:bg-cyan-50 dark:border-cyan-400 dark:text-cyan-400 dark:hover:bg-cyan-900/50"
                            title="Fetch Current Location"
                        >
                            {isFetchingLocation ? <Loader2 className="w-4 h-4 animate-spin" /> : <LocateFixed className="w-4 h-4" />}
                        </Button>
                    </div>
                </div>

                {/* Depth Input */}
                <div>
                    <Label htmlFor="depth" className="text-foreground flex items-center mb-1">
                        <ArrowDownUp className="w-4 h-4 mr-1 text-cyan-600 dark:text-cyan-400" /> Depth (meters)
                    </Label>
                    <Input
                        id="depth"
                        type="number"
                        placeholder="e.g., 15"
                        value={depth}
                        onChange={(e) => setDepth(e.target.value)}
                        className="text-sm p-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-inner focus:ring-cyan-500 focus:border-cyan-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                    />
                </div>
            </div>

            <Textarea
              placeholder="Example:&#10;2023-01-01,Reef A,26.5,35.2,8.1,6.5,0.8,0.05&#10;2023-01-02,Reef A,26.7,35.1,8.1,6.6,0.7,0.04"
              value={sensorData}
              onChange={(e) => {
                console.log("Sensor data changed:", e.target.value);
                setSensorData(e.target.value);
              }}
              className="min-h-[150px] text-sm p-3 border border-gray-300 dark:border-gray-700 rounded-md shadow-inner focus:ring-cyan-500 focus:border-cyan-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
            />
            <Button
              onClick={analyzeData}
              disabled={isLoading || !sensorData.trim() || !latitude || !longitude || !depth } // Updated disabled condition
              className="mt-4 w-full bg-cyan-500 text-white hover:bg-cyan-600 disabled:opacity-50 transition-all duration-300 transform hover:scale-105 shadow-md text-lg font-semibold py-3 rounded-lg"
            >
              <Activity className="w-5 h-5 mr-2" /> {isLoading ? 'Analyzing...' : 'Analyze Data'}
            </Button>
            {isLoading && (
              <div className="w-full px-4 mt-4">
                <Progress value={analysisProgress} className="w-full [&>div]:bg-cyan-400 h-2.5 rounded-full bg-white/30" />
                <p className="text-center text-sm text-foreground mt-2"> {/* Ensure foreground color */}
                  Analysis Progress: {analysisProgress.toFixed(0)}% {remainingTimeText && `(${remainingTimeText})`}
                </p>
              </div>
            )}
          </CardContent>
        </Card>


        {/* Analysis Results Table */}
        {analysisResults.length > 0 && (
          <Card className="bg-white/90 dark:bg-slate-900/90 text-foreground shadow-xl rounded-xl backdrop-blur-md border border-white/30 overflow-hidden">
            <CardHeader className="flex flex-row items-start sm:items-center justify-between pb-2">
             <div>
                <CardTitle className="text-xl font-semibold text-foreground">Analysis Results</CardTitle>
                {/* Display Analyzed Location and Depth */}
                {(analyzedLatitude !== null && analyzedLongitude !== null && analyzedDepth !== null) && (
                    <CardDescription className="text-sm text-muted-foreground mt-1 flex items-center flex-wrap">
                        <MapPin className="w-4 h-4 mr-1 text-cyan-600 dark:text-cyan-400"/>
                         {identifiedLocationName && (
                            <span className="mr-3 text-foreground">{identifiedLocationName}</span>
                        )}
                        <span className="mr-3 text-foreground">(Lat: {analyzedLatitude.toFixed(4)}, Lon: {analyzedLongitude.toFixed(4)})</span>
                        <ArrowDownUp className="w-4 h-4 mr-1 text-cyan-600 dark:text-cyan-400"/>
                        <span className="text-foreground">Depth: {analyzedDepth}m</span>
                    </CardDescription>
                )}
              </div>
              <Button
                onClick={downloadReport}
                className="bg-cyan-500 text-white hover:bg-cyan-600 transition-colors duration-300 shadow-sm mt-2 sm:mt-0" // Adjusted margin for smaller screens
                size="sm"
              >
                <Gauge className="w-4 h-4 mr-2" /> Download Report (PDF)
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table className="min-w-full">
                  <TableHeader className="bg-cyan-600/10 dark:bg-cyan-400/10">
                    <TableRow className="border-b border-cyan-200/30 dark:border-cyan-700/30">
                      <TableHead className="text-left font-medium py-3 px-4 border-r border-cyan-200/30 dark:border-cyan-700/30 text-foreground">Time</TableHead>
                      <TableHead className="text-left font-medium py-3 px-4 border-r border-cyan-200/30 dark:border-cyan-700/30 text-foreground">Location</TableHead>
                      <TableHead className="text-center font-medium py-3 px-4 border-r border-cyan-200/30 dark:border-cyan-700/30 text-foreground">Suitability</TableHead>
                      <TableHead className="text-right font-medium py-3 px-4 border-r border-cyan-200/30 dark:border-cyan-700/30 text-foreground">Water Temp (°C)</TableHead>
                      <TableHead className="text-right font-medium py-3 px-4 border-r border-cyan-200/30 dark:border-cyan-700/30 text-foreground">Salinity (PSU)</TableHead>
                      <TableHead className="text-right font-medium py-3 px-4 border-r border-cyan-200/30 dark:border-cyan-700/30 text-foreground">pH Level</TableHead>
                      <TableHead className="text-right font-medium py-3 px-4 border-r border-cyan-200/30 dark:border-cyan-700/30 text-foreground">Oxygen (mg/L)</TableHead>
                      <TableHead className="text-right font-medium py-3 px-4 border-r border-cyan-200/30 dark:border-cyan-700/30 text-foreground">Turbidity (NTU)</TableHead>
                      <TableHead className="text-right font-medium py-3 px-4 border-r border-cyan-200/30 dark:border-cyan-700/30 text-foreground">Nitrate (mg/L)</TableHead>
                      <TableHead className="text-left font-medium py-3 px-4 border-r border-cyan-200/30 dark:border-cyan-700/30 text-foreground">Summary</TableHead>
                      <TableHead className="text-left font-medium py-3 px-4 text-foreground">Suggested Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {analysisResults.map((result, index) => {
                      const isPrediction = result.isPrediction === true; // More robust check
                      let suitabilityClass = '';
                      let suitabilityText = '';
                      let suitabilityIndexText = result.suitabilityIndex !== undefined ? `(${result.suitabilityIndex.toFixed(0)})` : '';


                      if (isPrediction) {
                        suitabilityClass = 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-300';
                        suitabilityText = 'Prediction';
                        suitabilityIndexText = '';
                      } else {
                        // Use the calculated suitabilityIndex for coloring
                        if (result.suitabilityIndex === undefined) {
                          // Fallback if index somehow isn't calculated
                          suitabilityClass = 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-300';
                          suitabilityText = 'Unknown';
                        } else if (result.suitabilityIndex >= 80) { // Ideal
                          suitabilityClass = 'bg-green-200 dark:bg-green-800/50 text-green-800 dark:text-green-200';
                          suitabilityText = 'Suitable';
                        } else if (result.suitabilityIndex >= 50) { // Warning/Caution
                          suitabilityClass = 'bg-yellow-200 dark:bg-yellow-800/50 text-yellow-800 dark:text-yellow-200';
                          suitabilityText = 'Warning';
                        } else { // Threatening
                          suitabilityClass = 'bg-red-200 dark:bg-red-800/50 text-red-800 dark:text-red-200';
                          suitabilityText = 'Threatening';
                        }
                      }


                      return (
                        <TableRow key={index} className="border-b border-cyan-200/30 dark:border-cyan-700/30 last:border-0 hover:bg-cyan-500/10 dark:hover:bg-cyan-400/10 transition-colors duration-150">
                          <TableCell className="py-2 border-r border-cyan-200/30 dark:border-cyan-700/30 px-4 text-foreground">{result.time}</TableCell>
                          <TableCell className="py-2 border-r border-cyan-200/30 dark:border-cyan-700/30 px-4 text-foreground">{result.location}</TableCell>
                          <TableCell className={`py-2 text-center border-r border-cyan-200/30 dark:border-cyan-700/30 px-4`}>
                            <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium shadow-sm ${suitabilityClass}`}>
                              {suitabilityText} {suitabilityIndexText}
                            </span>
                          </TableCell>
                          <TableCell className="py-2 text-right border-r border-cyan-200/30 dark:border-cyan-700/30 px-4 text-foreground">{result.waterTemperature.toFixed(2)}</TableCell>
                          <TableCell className="py-2 text-right border-r border-cyan-200/30 dark:border-cyan-700/30 px-4 text-foreground">{result.salinity.toFixed(2)}</TableCell>
                          <TableCell className="py-2 text-right border-r border-cyan-200/30 dark:border-cyan-700/30 px-4 text-foreground">{result.pHLevel.toFixed(2)}</TableCell>
                          <TableCell className="py-2 text-right border-r border-cyan-200/30 dark:border-cyan-700/30 px-4 text-foreground">{result.dissolvedOxygen.toFixed(2)}</TableCell>
                          <TableCell className="py-2 text-right border-r border-cyan-200/30 dark:border-cyan-700/30 px-4 text-foreground">{result.turbidity.toFixed(2)}</TableCell>
                          <TableCell className="py-2 text-right border-r border-cyan-200/30 dark:border-cyan-700/30 px-4 text-foreground">{result.nitrate.toFixed(2)}</TableCell>
                          <TableCell className="py-2 border-r border-cyan-200/30 dark:border-cyan-700/30 px-4">
                            <Accordion type="single" collapsible className="w-full">
                              <AccordionItem value={`summary-${index}`} className="border-b-0">
                                <AccordionTrigger data-summary-trigger className="py-1 text-xs hover:no-underline [&>svg]:text-cyan-500 text-foreground">View</AccordionTrigger>
                                <AccordionContent data-summary-content className="text-xs pt-1 pb-2 text-muted-foreground">
                                  {result.summary || 'N/A'}
                                </AccordionContent>
                              </AccordionItem>
                            </Accordion>
                          </TableCell>
                          <TableCell className="py-2 px-4">
                            <Accordion type="single" collapsible className="w-full">
                              <AccordionItem value={`actions-${index}`} className="border-b-0">
                                <AccordionTrigger data-actions-trigger className="py-1 text-xs hover:no-underline [&>svg]:text-cyan-500 text-foreground">View Actions</AccordionTrigger>
                                <AccordionContent data-actions-content>
                                  <ul className="list-disc pl-5 text-xs space-y-1 text-muted-foreground">
                                    {result.improvements && result.improvements.length > 0 ? (
                                      result.improvements.map((improvement, i) => (
                                        <li key={i}>{improvement}</li>
                                      ))
                                    ) : (
                                      <li>{(isPrediction) ? 'N/A for predictions' : 'No specific actions suggested.'}</li>
                                    )}
                                  </ul>
                                </AccordionContent>
                              </AccordionItem>
                            </Accordion>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Charts Section */}
        {analysisResults.length > 0 && (
          <Accordion type="multiple" className="w-full space-y-4">
             {/* New Suitability Index Chart */}
             <AccordionItem value="suitabilityIndex" key="suitabilityIndex" className="border-none">
                <Card className="bg-white/90 dark:bg-slate-900/90 text-foreground shadow-xl rounded-xl backdrop-blur-md border border-white/30 overflow-hidden">
                  <AccordionTrigger data-graph-trigger className="text-lg font-medium p-4 hover:no-underline hover:bg-cyan-500/10 dark:hover:bg-cyan-400/10 transition-colors duration-150 rounded-t-xl w-full flex items-center justify-between text-foreground">
                    <div className="flex items-center">
                      <TrendingUp className="w-5 h-5 mr-2 text-cyan-500" /> {/* Using TrendingUp icon */}
                      Overall Suitability Index Trends
                    </div>
                  </AccordionTrigger>
                  <AccordionContent data-graph-content className="p-4 border-t border-cyan-200/30 dark:border-cyan-700/30">
                    <p className="text-sm text-muted-foreground mb-4 text-foreground">
                      Visualizing the overall Suitability Index (0-100) over time. Predictions are not available for this metric.
                    </p>
                    <ChartContainer config={chartConfig} className="aspect-video h-[300px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart // Changed to LineChart
                          data={analysisResults.filter(d => !d.isPrediction)} // Only show actual data for suitability index
                          margin={{ top: 5, right: 30, left: 0, bottom: 5 }}
                        >
                           {/* Removed background gradient based on suitability */}
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.5)" />
                          <XAxis dataKey="time" stroke="hsl(var(--foreground))" tick={{ fontSize: 12, fill: 'hsl(var(--foreground))' }} axisLine={false} tickLine={false} padding={{ left: 10, right: 10 }} />
                          <YAxis domain={[0, 100]} stroke="hsl(var(--foreground))" tick={{ fontSize: 12, fill: 'hsl(var(--foreground))' }} axisLine={false} tickLine={false} />
                          <RechartsTooltip
                            content={
                              <ChartTooltipContent
                                indicator="dot"
                                labelClassName="text-sm font-medium text-foreground"
                                className="rounded-lg border border-border/50 bg-background/90 p-2 shadow-lg backdrop-blur-sm text-foreground"
                                formatter={(value, name, props) => [`${(value as number).toFixed(0)}`, chartConfig.suitabilityIndex?.label]}
                              />
                            }
                            cursor={{ stroke: "hsl(var(--accent))", strokeWidth: 1, strokeDasharray: "3 3" }}
                          />
                           <RechartsLegend content={ <ChartLegendContent
                                payload={
                                    Object.entries(chartConfig)
                                    .filter(([key]) => key === 'suitabilityIndex') // Only show suitability index legend
                                    .map(([key, config]) => ({
                                        value: config.label,
                                        type: 'line',
                                        id: key,
                                        color: config.color,
                                        icon: config.icon
                                    }))
                                }
                                className="text-foreground" // Ensure legend text is visible
                             /> }
                            />

                           {/* Line to connect the dots */}
                           <Line
                             key={`suitabilityIndex-line`}
                             dataKey='suitabilityIndex'
                             type="linear"
                             stroke="#000000" // Black line
                             strokeWidth={1.5} // Medium width
                             dot={{ fill: chartConfig.suitabilityIndex?.color || 'hsl(var(--primary))', r: 4, strokeWidth: 0 }}
                             activeDot={{ r: 6, strokeWidth: 1, fill: chartConfig.suitabilityIndex?.color || 'hsl(var(--primary))', stroke: 'hsl(var(--foreground))' }}
                             name={chartConfig.suitabilityIndex?.label || "Suitability Index"}
                             isAnimationActive={false}
                             connectNulls={false} // Don't connect if data is missing
                           />
                        </LineChart>
                      </ResponsiveContainer>
                    </ChartContainer>
                  </AccordionContent>
                </Card>
              </AccordionItem>

            {/* Individual Parameter Charts */}
            {parameters.map((parameter) => (
              <AccordionItem value={parameter.key} key={parameter.key} className="border-none">
                <Card className="bg-white/90 dark:bg-slate-900/90 text-foreground shadow-xl rounded-xl backdrop-blur-md border border-white/30 overflow-hidden">
                  <AccordionTrigger data-graph-trigger className="text-lg font-medium p-4 hover:no-underline hover:bg-cyan-500/10 dark:hover:bg-cyan-400/10 transition-colors duration-150 rounded-t-xl w-full flex items-center justify-between text-foreground">
                    <div className="flex items-center">
                      <parameter.icon className="w-5 h-5 mr-2 text-cyan-500" />
                       {parameter.name} Trends
                    </div>
                  </AccordionTrigger>
                  <AccordionContent data-graph-content className="p-4 border-t border-cyan-200/30 dark:border-cyan-700/30">
                    <p className="text-sm text-muted-foreground mb-4 text-foreground">
                      Visualizing {parameter.name} ({parameter.unit}) over time, including predicted values.
                    </p>
                    <ChartContainer config={chartConfig} className="aspect-video h-[300px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart // Changed to LineChart
                          data={analysisResults}
                          margin={{ top: 5, right: 30, left: 0, bottom: 5 }}
                        >
                           {/* Removed background gradient */}
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.5)" />
                          <XAxis dataKey="time" stroke="hsl(var(--foreground))" tick={{ fontSize: 12, fill: 'hsl(var(--foreground))' }} axisLine={false} tickLine={false} padding={{ left: 10, right: 10 }} />
                          <YAxis stroke="hsl(var(--foreground))" tick={{ fontSize: 12, fill: 'hsl(var(--foreground))' }} axisLine={false} tickLine={false} domain={['auto', 'auto']} />
                          <RechartsTooltip
                            content={
                              <ChartTooltipContent
                                indicator="dot"
                                labelClassName="text-sm font-medium text-foreground"
                                className="rounded-lg border border-border/50 bg-background/90 p-2 shadow-lg backdrop-blur-sm text-foreground"
                              />
                            }
                            cursor={{ stroke: "hsl(var(--accent))", strokeWidth: 1, strokeDasharray: "3 3" }}
                          />
                           <RechartsLegend content={ <ChartLegendContent
                                payload={
                                    Object.entries(chartConfig)
                                    .filter(([key]) => key === parameter.key || key === 'prediction') // Filter relevant keys
                                    .map(([key, config]) => ({
                                        value: config.label,
                                        type: key === 'prediction' ? 'dashed' : 'line',
                                        id: key,
                                        // Use parameter color for actual data, prediction color for predictions
                                        color: key === 'prediction' ? config.color : chartConfig[parameter.key]?.color,
                                        icon: config.icon
                                    }))
                                }
                                className="text-foreground" // Ensure legend text is visible
                             /> }
                            />

                            {/* Line for actual data */}
                            <Line
                                key={`${parameter.key}-actual-line`}
                                dataKey={(payload: AnalysisResult) => payload.isPrediction ? null : payload[parameter.key as keyof SensorData]}
                                type="linear"
                                stroke="#000000" // Black line
                                strokeWidth={1.5} // Medium width
                                dot={{ fill: chartConfig[parameter.key]?.color || 'hsl(var(--foreground))', r: 4, strokeWidth: 0 }} // Use parameter color or black for dots
                                activeDot={{ r: 6, strokeWidth: 1, fill: chartConfig[parameter.key]?.color || 'hsl(var(--foreground))', stroke: 'hsl(var(--foreground))' }} // Active dot styling
                                name={chartConfig[parameter.key]?.label || parameter.name} // Use label from config
                                isAnimationActive={false}
                                connectNulls={false} // Do not connect across the prediction boundary
                             />

                            {/* Line for predicted data */}
                           <Line
                                key={`${parameter.key}-prediction-line`}
                                dataKey={(payload: AnalysisResult, index: number) => {
                                   const firstPredictionIndex = analysisResults.findIndex(d => d.isPrediction === true);
                                   if (payload.isPrediction || (firstPredictionIndex !== -1 && index === firstPredictionIndex - 1)) {
                                       return payload[parameter.key as keyof SensorData];
                                   }
                                   return null;
                                }}
                                type="linear"
                                stroke="#000000" // Black line
                                strokeWidth={1.5} // Medium width
                                strokeDasharray="5 5" // Dashed line for predictions
                                dot={{ fill: chartConfig.prediction.color, r: 4, strokeWidth: 0 }} // Dots for predictions
                                activeDot={false} // Usually disable active dot for predictions
                                name={`${chartConfig[parameter.key]?.label || parameter.name} (Pred.)`} // Use label from config
                                isAnimationActive={false}
                                connectNulls={true} // Connect prediction points to each other and the last actual point
                           />
                        </LineChart>
                      </ResponsiveContainer>
                    </ChartContainer>
                  </AccordionContent>
                </Card>
              </AccordionItem>
            ))}

            {/* Additional Visualization: Overall Parameter Distribution */}
            <AccordionItem value="distribution" key="distribution" className="border-none">
                <Card className="bg-white/90 dark:bg-slate-900/90 text-foreground shadow-xl rounded-xl backdrop-blur-md border border-white/30 overflow-hidden">
                  <AccordionTrigger data-graph-trigger className="text-lg font-medium p-4 hover:no-underline hover:bg-cyan-500/10 dark:hover:bg-cyan-400/10 transition-colors duration-150 rounded-t-xl w-full flex items-center justify-between text-foreground">
                    <div className="flex items-center">
                      <BarChartBig className="w-5 h-5 mr-2 text-cyan-500" />
                      Average Parameter Values
                    </div>
                  </AccordionTrigger>
                  <AccordionContent data-graph-content className="p-4 border-t border-cyan-200/30 dark:border-cyan-700/30">
                    <p className="text-sm text-muted-foreground mb-4 text-foreground">
                      Average values for each parameter across the observed data points (excluding predictions).
                    </p>
                    <ChartContainer config={chartConfig} className="aspect-video h-[300px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                         {/* Prepare data for Bar Chart - Calculate Averages */}
                         {(() => {
                             const actualData = analysisResults.filter(d => !d.isPrediction);
                             const averages = parameters.map(param => {
                                 const sum = actualData.reduce((acc, curr) => acc + (curr[param.key as keyof SensorData] as number || 0), 0);
                                 const avg = actualData.length > 0 ? sum / actualData.length : 0;
                                 return {
                                     name: chartConfig[param.key]?.label || param.name,
                                     value: avg,
                                     fill: chartConfig[param.key]?.color || 'hsl(var(--foreground))'
                                 };
                             });

                             return (
                                 // Note: Using AreaChart frame but Bar component is more appropriate
                                 // Consider switching to <BarChart> if layout issues arise or for clarity
                                 <ResponsiveContainer width="100%" height="100%">
                                     <AreaChart // Or use <BarChart>
                                        data={averages}
                                        layout="vertical" // Vertical Bar Chart
                                        margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.5)" horizontal={false}/>
                                        <XAxis type="number" stroke="hsl(var(--foreground))" tick={{ fontSize: 12, fill: 'hsl(var(--foreground))' }} axisLine={false} tickLine={false} />
                                        <YAxis dataKey="name" type="category" stroke="hsl(var(--foreground))" tick={{ fontSize: 10, fill: 'hsl(var(--foreground))' }} axisLine={false} tickLine={false} width={150} />
                                        <RechartsTooltip
                                            content={
                                                <ChartTooltipContent
                                                    labelClassName="text-sm font-medium text-foreground"
                                                    className="rounded-lg border border-border/50 bg-background/90 p-2 shadow-lg backdrop-blur-sm text-foreground"
                                                    formatter={(value, name) => [`${(value as number).toFixed(2)}`, name]} // Show value with 2 decimal places
                                                    cursor={{ fill: 'hsl(var(--accent)/0.2)' }}
                                                />
                                            }
                                        />
                                         {/* Use Bar component */}
                                         <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                                           {averages.map((entry, index) => (
                                             <Cell key={`cell-${index}`} fill={entry.fill} />
                                           ))}
                                         </Bar>
                                     </AreaChart>
                                 </ResponsiveContainer>
                             );
                         })()}
                      </ResponsiveContainer>
                    </ChartContainer>
                  </AccordionContent>
                </Card>
            </AccordionItem>

          </Accordion>
        )}

        {/* Parameter Ranges Table */}
        {analysisResults.length > 0 && (
          <Card className="mt-8 bg-white/90 dark:bg-slate-900/90 text-foreground shadow-xl rounded-xl backdrop-blur-md border border-white/30 overflow-hidden">
            <CardHeader>
              <CardTitle className="text-xl font-semibold text-foreground">Parameter Ranges for Coral Health</CardTitle>
              <CardDescription className="text-muted-foreground text-sm text-foreground">Reference thresholds for ideal, caution, and threatening conditions.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table className="min-w-full">
                  <TableHeader className="bg-cyan-600/10 dark:bg-cyan-400/10">
                    <TableRow className="border-b border-cyan-200/30 dark:border-cyan-700/30">
                      <TableHead className="text-left font-medium py-3 px-4 border-r border-cyan-200/30 dark:border-cyan-700/30 text-foreground">Parameter</TableHead>
                      <TableHead className="text-center font-medium py-3 px-4 border-r border-cyan-200/30 dark:border-cyan-700/30 bg-green-100/50 dark:bg-green-900/50 text-green-800 dark:text-green-200">Ideal Range</TableHead>
                      <TableHead className="text-center font-medium py-3 px-4 border-r border-cyan-200/30 dark:border-cyan-700/30 bg-yellow-100/50 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-200">Caution Range</TableHead>
                      <TableHead className="text-center font-medium py-3 px-4 bg-red-100/50 dark:bg-red-900/50 text-red-800 dark:text-red-200">Threatening Condition</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow className="border-b border-cyan-200/30 dark:border-cyan-700/30">
                      <TableCell className="font-medium border-r border-cyan-200/30 dark:border-cyan-700/30 py-2 px-4 text-foreground">Water Temperature (°C)</TableCell>
                      <TableCell className="text-center border-r border-cyan-200/30 dark:border-cyan-700/30 py-2 px-4 text-foreground">24-28</TableCell>
                      <TableCell className="text-center border-r border-cyan-200/30 dark:border-cyan-700/30 py-2 px-4 text-foreground">28-30</TableCell>
                      <TableCell className="text-center py-2 px-4 text-foreground">Above 30 (Bleaching risk)</TableCell>
                    </TableRow>
                    <TableRow className="border-b border-cyan-200/30 dark:border-cyan-700/30">
                      <TableCell className="font-medium border-r border-cyan-200/30 dark:border-cyan-700/30 py-2 px-4 text-foreground">Salinity (PSU)</TableCell>
                      <TableCell className="text-center border-r border-cyan-200/30 dark:border-cyan-700/30 py-2 px-4 text-foreground">33-36</TableCell>
                      <TableCell className="text-center border-r border-cyan-200/30 dark:border-cyan-700/30 py-2 px-4 text-foreground">31-33 or 36-38</TableCell>
                      <TableCell className="text-center py-2 px-4 text-foreground">Below 31 or Above 38</TableCell>
                    </TableRow>
                    <TableRow className="border-b border-cyan-200/30 dark:border-cyan-700/30">
                      <TableCell className="font-medium border-r border-cyan-200/30 dark:border-cyan-700/30 py-2 px-4 text-foreground">pH Level</TableCell>
                      <TableCell className="text-center border-r border-cyan-200/30 dark:border-cyan-700/30 py-2 px-4 text-foreground">8.0-8.3</TableCell>
                      <TableCell className="text-center border-r border-cyan-200/30 dark:border-cyan-700/30 py-2 px-4 text-foreground">7.8-8.0</TableCell>
                      <TableCell className="text-center py-2 px-4 text-foreground">Below 7.8 (Acidification)</TableCell>
                    </TableRow>
                    <TableRow className="border-b border-cyan-200/30 dark:border-cyan-700/30">
                      <TableCell className="font-medium border-r border-cyan-200/30 dark:border-cyan-700/30 py-2 px-4 text-foreground">Dissolved Oxygen (mg/L)</TableCell>
                      <TableCell className="text-center border-r border-cyan-200/30 dark:border-cyan-700/30 py-2 px-4 text-foreground">&gt; 6.0</TableCell>
                      <TableCell className="text-center border-r border-cyan-200/30 dark:border-cyan-700/30 py-2 px-4 text-foreground">4.0-6.0</TableCell>
                      <TableCell className="text-center py-2 px-4 text-foreground">Below 4.0 (Hypoxia)</TableCell>
                    </TableRow>
                    <TableRow className="border-b border-cyan-200/30 dark:border-cyan-700/30">
                      <TableCell className="font-medium border-r border-cyan-200/30 dark:border-cyan-700/30 py-2 px-4 text-foreground">Turbidity (NTU)</TableCell>
                      <TableCell className="text-center border-r border-cyan-200/30 dark:border-cyan-700/30 py-2 px-4 text-foreground">&lt; 1.0</TableCell>
                      <TableCell className="text-center border-r border-cyan-200/30 dark:border-cyan-700/30 py-2 px-4 text-foreground">1.0-3.0</TableCell>
                      <TableCell className="text-center py-2 px-4 text-foreground">Above 3.0</TableCell>
                    </TableRow>
                    <TableRow className="border-b-0">
                      <TableCell className="font-medium border-r border-cyan-200/30 dark:border-cyan-700/30 py-2 px-4 text-foreground">Nitrate (mg/L)</TableCell>
                      <TableCell className="text-center border-r border-cyan-200/30 dark:border-cyan-700/30 py-2 px-4 text-foreground">&lt; 0.1</TableCell>
                      <TableCell className="text-center border-r border-cyan-200/30 dark:border-cyan-700/30 py-2 px-4 text-foreground">0.1-0.3</TableCell>
                      <TableCell className="text-center py-2 px-4 text-foreground">Above 0.3 (Algal blooms)</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

         {/* Location and Depth Visualization Section - Conditionally render */}
         <Card className={cn(
              "mt-8 bg-white/90 dark:bg-slate-900/90 text-foreground shadow-xl rounded-xl backdrop-blur-md border border-white/30 overflow-hidden",
              !(analysisResults.length > 0 && analyzedLatitude !== null && analyzedLongitude !== null && analyzedDepth !== null) && "hidden" // Hide if no analysis or missing location/depth
         )}>
             <CardHeader>
                <CardTitle className="text-xl font-semibold text-foreground">Location & Depth Visualization</CardTitle>
                <CardDescription className="text-muted-foreground text-sm text-foreground">Depth representation based on provided depth.</CardDescription>
             </CardHeader>
             {(analysisResults.length > 0 && analyzedLatitude !== null && analyzedLongitude !== null && analyzedDepth !== null) && (
                 <CardContent className="p-4 flex justify-center"> {/* Center content */}
                     {/* Depth Visualization */}
                     <div className="flex flex-col items-center">
                          <h3 className="text-lg font-medium mb-2 text-foreground">Depth Representation</h3>
                          {/* Pass only depth, suitabilityIndex is removed */}
                          <DepthVisualization depth={analyzedDepth} />
                      </div>
                 </CardContent>
             )}
         </Card>

      </div>

      {/* Footer Section */}
      <footer className="w-full max-w-5xl mt-12 text-center text-white/70 text-xs p-4">
         <p>© 2025 CoralGuard by Senath Sethmika. All rights reserved.</p>
         <p>Data analysis for educational and scientific purposes only.</p>
         <div className="flex justify-center space-x-4 mt-2">
             <Link href="https://www.linkedin.com/in/senath-sethmika/" target="_blank" rel="noopener noreferrer" className="hover:text-cyan-300 transition-colors duration-300">
                LinkedIn
            </Link>
            <Link href="https://web.facebook.com/senath.sethmika/" target="_blank" rel="noopener noreferrer" className="hover:text-cyan-300 transition-colors duration-300">
                 Facebook
             </Link>
             <Link href="https://github.com/senath112" target="_blank" rel="noopener noreferrer" className="hover:text-cyan-300 transition-colors duration-300">
                Github
            </Link>
        </div>
      </footer>

    </div>
  );
}
