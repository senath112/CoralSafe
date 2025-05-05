'use client';

import { useState, useCallback, useRef, useEffect, DragEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { cn, defineSensorDataThresholds, analyzeSensorData, calculateSuitabilityIndex } from '@/lib/utils';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from '@/components/ui/chart';
import type { ChartConfig } from "@/components/ui/chart";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend as RechartsLegend, ResponsiveContainer, AreaChart, Area, Bar, Cell, Scatter, ScatterChart } from 'recharts';
import { Progress } from "@/components/ui/progress";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import * as tf from '@tensorflow/tfjs';
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
import { Fish, Waves, Droplet, Thermometer, Beaker, Wind, CloudFog, Activity, Gauge, Loader2, ArrowDownUp, MapPin, TrendingUp, BarChartBig, LocateFixed } from 'lucide-react';
import { trainPredictionModel, generatePredictions, type NormalizationParams } from '@/lib/prediction-model';
import dynamic from 'next/dynamic';
import { getLocationName } from '@/ai/flows/get-location-name';
import { parse } from 'date-fns';
import { ThemeToggle } from "@/components/theme-toggle";


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
  suitabilityIndex: { label: "Suitability Index", color: "hsl(var(--primary))", icon: TrendingUp },
  prediction: { label: "Prediction", color: "hsl(var(--muted-foreground))", icon: () => <path d="M3 3v18h18" fill="none" strokeDasharray="5 5" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" className="stroke-muted-foreground" /> },
} satisfies ChartConfig;

// --- Helper function to generate gradient definitions for Area fills ---
const renderGradientDefs = (config: ChartConfig, parameters: { key: string }[]) => {
  const gradientIds = new Set<string>();

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
              <stop offset="5%" stopColor={paramConfig.color} stopOpacity={0.6} />
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

  const csvDataRef = useRef<string>('');
  const reportRef = useRef<HTMLDivElement>(null);

  const [startTime, setStartTime] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState<number>(0);
  const [remainingTimeText, setRemainingTimeText] = useState<string>('');

  // State for new inputs
  const [latitude, setLatitude] = useState<string>('');
  const [longitude, setLongitude] = useState<string>('');
  const [depth, setDepth] = useState<string>('');
  const [isFetchingLocation, setIsFetchingLocation] = useState<boolean>(false);

  // State to store values after analysis starts
  const [analyzedLatitude, setAnalyzedLatitude] = useState<number | null>(null);
  const [analyzedLongitude, setAnalyzedLongitude] = useState<number | null>(null);
  const [analyzedDepth, setAnalyzedDepth] = useState<number | null>(null);
  const [identifiedLocationName, setIdentifiedLocationName] = useState<string | null>(null);

  // For time estimation
  const progressRef = useRef<{ time: number; progress: number }[]>([]);
  const remainingTimeRef = useRef<number | null>(null);
  const lastProgressRef = useRef<number>(0);

  // State for drag and drop
  const [isDragging, setIsDragging] = useState<boolean>(false);

   useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null;

    if (isLoading && startTime !== null) {
        intervalId = setInterval(() => {
            const now = Date.now();
            const elapsed = now - startTime;
            setElapsedTime(elapsed);

            // Use the latest progress directly
            const currentProgress = analysisProgress;

            // Record progress history only if it has increased meaningfully
            if (currentProgress > lastProgressRef.current + 0.1) { // Only update if progress increases by > 0.1%
                progressRef.current.push({ time: elapsed, progress: currentProgress });
                lastProgressRef.current = currentProgress;
                // Keep a longer history for better rate calculation (e.g., last 15 seconds)
                const historyCutoff = elapsed - 15000;
                progressRef.current = progressRef.current.filter(p => p.time >= historyCutoff);
            }


            let remainingTimeMs = -1;

             // Calculate remaining time only if progress is between 1% and 99% and we have enough history
             if (currentProgress > 1 && currentProgress < 99 && progressRef.current.length >= 2) {
                 const firstPoint = progressRef.current[0];
                 const lastPoint = progressRef.current[progressRef.current.length - 1];
                 const progressDelta = lastPoint.progress - firstPoint.progress;
                 const timeDelta = lastPoint.time - firstPoint.time;

                 // Check for meaningful deltas to avoid division by zero or unstable rates
                 if (progressDelta > 0.5 && timeDelta > 1000) { // Need at least 0.5% progress over 1 second
                     const progressRate = progressDelta / timeDelta; // progress % per millisecond
                     const remainingProgress = 100 - currentProgress;
                     remainingTimeMs = remainingProgress / progressRate; // milliseconds
                 }
             }

             // Smooth the estimate using exponential moving average (EMA)
             const previousEstimate = remainingTimeRef.current;
             const alpha = 0.2; // Smoothing factor (lower means smoother, less responsive)
             if (remainingTimeMs > 0) {
                 if (previousEstimate !== null) {
                    // Apply EMA: NewEstimate = alpha * CurrentRawEstimate + (1 - alpha) * PreviousSmoothedEstimate
                    remainingTimeMs = alpha * remainingTimeMs + (1 - alpha) * previousEstimate;
                 }
                 remainingTimeRef.current = remainingTimeMs; // Update the stored smoothed estimate
             } else if (previousEstimate !== null) {
                 // If calculation failed, use the last valid estimate slightly decayed
                 // remainingTimeMs = previousEstimate * 0.98; // Example decay
                 // remainingTimeRef.current = remainingTimeMs > 1000 ? remainingTimeMs : null;
                 remainingTimeMs = previousEstimate; // Or just keep the last estimate
             }


            if (remainingTimeMs > 0) {
                const remainingSeconds = Math.max(0, Math.round(remainingTimeMs / 1000));
                const minutes = Math.floor(remainingSeconds / 60);
                const seconds = remainingSeconds % 60;

                let timeString = '';
                 if (remainingSeconds > 120) { // More than 2 minutes
                     timeString = `~${minutes}m left`;
                 } else if (minutes > 0) { // Between 1 and 2 minutes
                    timeString = `~${minutes}m ${seconds}s left`;
                } else if (seconds > 1) { // Less than 1 minute
                    timeString = `~${seconds}s left`;
                } else if (currentProgress < 100) { // Very close to end
                   timeString = 'Finishing up...';
                } else { // Should not happen if isLoading is true
                    timeString = '';
                }
                setRemainingTimeText(timeString);

            } else if (currentProgress === 0) {
                setRemainingTimeText('Starting analysis...');
            } else if (currentProgress >= 100) {
                setRemainingTimeText('Analysis complete!');
                if (intervalId) clearInterval(intervalId); // Stop interval on completion
            } else {
                 // Only show calculating if we don't have a valid estimate yet
                 if (remainingTimeRef.current === null) {
                    setRemainingTimeText('Calculating time...');
                 } else {
                     // Keep showing the last valid estimate if available
                     const lastEstimateSeconds = Math.round(remainingTimeRef.current / 1000);
                     const lastMinutes = Math.floor(lastEstimateSeconds / 60);
                     const lastSeconds = lastEstimateSeconds % 60;
                     if (lastEstimateSeconds > 120) timeString = `~${lastMinutes}m left`;
                     else if (lastMinutes > 0) timeString = `~${lastMinutes}m ${lastSeconds}s left`;
                     else if (lastSeconds > 1) timeString = `~${lastSeconds}s left`;
                     else timeString = 'Finishing up...';
                     setRemainingTimeText(timeString);
                 }
            }
        }, 1000); // Update estimate every second
    } else {
        // Reset when not loading
        setElapsedTime(0);
        progressRef.current = [];
        remainingTimeRef.current = null;
        lastProgressRef.current = 0;
        if (analysisProgress === 100 && !isLoading) { // Explicitly set completion text after loading stops
            setRemainingTimeText('Analysis complete!');
        } else {
            setRemainingTimeText(''); // Clear text otherwise
        }
    }

    // Cleanup function
    return () => {
        if (intervalId) {
            clearInterval(intervalId);
        }
    };
    // Dependencies: recalculate if loading state changes, start time is set, or progress updates
  }, [isLoading, startTime, analysisProgress]);


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

    // Temporarily change text colors for PDF rendering (only elements not explicitly colored)
    const originalColors = new Map<HTMLElement | SVGTextElement | SVGTSpanElement, string>();
    const elementsToColor = input.querySelectorAll<HTMLElement | SVGTextElement | SVGTSpanElement>(
        // Select common text elements, but exclude those inside colored suitability badges or specific backgrounds
        'p, span, h1, h2, h3, h4, h5, h6, li, th, td, code, div:not([class*="bg-"]):not([class*="dark:bg-"]), text, tspan'
    );


    elementsToColor.forEach(el => {
      // Check if the element or its parent has a specific background/text color class we want to ignore
      let ignoreColorChange = false;
      let currentEl: Element | null = el;
      while (currentEl && currentEl !== input) {
        if (currentEl.classList.contains('bg-green-200') ||
            currentEl.classList.contains('bg-yellow-200') ||
            currentEl.classList.contains('bg-red-200') ||
            currentEl.classList.contains('bg-gray-200') ||
            currentEl.classList.contains('dark:bg-green-800/50') ||
            currentEl.classList.contains('dark:bg-yellow-800/50') ||
            currentEl.classList.contains('dark:bg-red-800/50') ||
            currentEl.classList.contains('dark:bg-gray-700') ||
            currentEl.closest('.recharts-tooltip-wrapper') || // Ignore tooltip content
            currentEl.closest('header')) { // Ignore header content
          ignoreColorChange = true;
          break;
        }
        currentEl = currentEl.parentElement;
      }

      // Apply black color only if it shouldn't be ignored
      if (!ignoreColorChange) {
        originalColors.set(el, el.style.color || el.style.fill); // Store original inline style or computed style if needed

        // Force color to black for PDF
        if (el instanceof SVGTextElement || el instanceof SVGTSpanElement) {
           el.style.setProperty('fill', 'black', 'important');
           el.style.color = ''; // Clear color style if it exists
        } else if (el instanceof HTMLElement) {
            el.style.setProperty('color', 'black', 'important');
            el.style.fill = ''; // Clear fill style if it exists
        }
      }
    });

    // --- Expand Accordions ---
    // Find all accordion triggers and content elements within the reportRef
    const summaryTriggers = Array.from(input.querySelectorAll<HTMLButtonElement>('[data-summary-trigger]'));
    const summaryContents = Array.from(input.querySelectorAll<HTMLElement>('[data-summary-content]'));
    const actionsTriggers = Array.from(input.querySelectorAll<HTMLButtonElement>('[data-actions-trigger]'));
    const actionsContents = Array.from(input.querySelectorAll<HTMLElement>('[data-actions-content]'));
    const graphTriggers = Array.from(input.querySelectorAll<HTMLButtonElement>('[data-graph-trigger]'));
    const graphContents = Array.from(input.querySelectorAll<HTMLElement>('[data-graph-content]'));

    // Store original state and force open
    const originalStates = new Map<Element, string | null>();

    const setState = (elements: Element[], state: 'open' | 'closed') => {
      elements.forEach(el => {
        if (!originalStates.has(el)) {
          originalStates.set(el, el.getAttribute('data-state')); // Store original state
        }
        el.setAttribute('data-state', state); // Force state
      });
    };

    setState(summaryTriggers, 'open');
    setState(summaryContents, 'open');
    setState(actionsTriggers, 'open');
    setState(actionsContents, 'open');
    setState(graphTriggers, 'open');
    setState(graphContents, 'open');
    // --- End Expand Accordions ---

    // Slight delay to allow DOM updates before capturing canvas
    setTimeout(() => {
      html2canvas(input, {
        scale: 2, // Higher scale for better resolution
        useCORS: true, // If using external images
        backgroundColor: '#ffffff', // Force white background for PDF
         // Attempt to capture from the top of the element, ignoring window scroll
         scrollY: -window.scrollY,
         windowWidth: document.documentElement.offsetWidth,
         windowHeight: document.documentElement.offsetHeight,
         // logging: true // Enable for debugging html2canvas issues
      })
        .then((canvas) => {
          const imgData = canvas.toDataURL('image/png');
          const pdf = new jsPDF('p', 'mm', 'a4'); // Portrait, mm, A4 size
          const pdfWidth = pdf.internal.pageSize.getWidth();
          const pdfHeight = pdf.internal.pageSize.getHeight();
          const imgProps = pdf.getImageProperties(imgData);
          // Calculate image dimensions to fit A4 width with margin
          const margin = 10; // 10mm margin on each side
          const imgWidth = pdfWidth - 2 * margin;
          const imgHeight = (imgProps.height * imgWidth) / imgProps.width;
          let heightLeft = imgHeight;
          let position = margin; // Initial Y position with margin

          // Add the first page
          pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight);
          heightLeft -= (pdfHeight - 2 * margin); // Subtract the visible height on the first page

          // Add subsequent pages if needed
          while (heightLeft > 0) {
            position = position - (pdfHeight - margin); // Adjust position for the next page (overlap slightly less than full height due to potential footer)
            pdf.addPage();
            pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight);
            heightLeft -= (pdfHeight - margin); // Subtract height of a full page (approx)
          }

          // Restore original colors and accordion states after PDF generation
          elementsToColor.forEach((el, key) => {
             const originalStyle = originalColors.get(key);
              if (el instanceof SVGTextElement || el instanceof SVGTSpanElement) {
                 if (originalStyle === null || originalStyle === undefined || originalStyle === '') {
                    el.style.removeProperty('fill');
                 } else {
                    el.style.setProperty('fill', originalStyle);
                 }
              } else if (el instanceof HTMLElement) {
                  if (originalStyle === null || originalStyle === undefined || originalStyle === '') {
                    el.style.removeProperty('color');
                  } else {
                     el.style.setProperty('color', originalStyle);
                  }
              }
           });

          originalStates.forEach((state, el) => {
            if (state) {
              el.setAttribute('data-state', state);
            } else {
              el.removeAttribute('data-state'); // Remove if it didn't exist originally
            }
          });


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
          // Restore styles and states even if PDF fails
           elementsToColor.forEach((el, key) => {
             const originalStyle = originalColors.get(key);
             if (el instanceof SVGTextElement || el instanceof SVGTSpanElement) {
                 if (originalStyle === null || originalStyle === undefined || originalStyle === '') el.style.removeProperty('fill');
                 else el.style.setProperty('fill', originalStyle);
              } else if (el instanceof HTMLElement) {
                  if (originalStyle === null || originalStyle === undefined || originalStyle === '') el.style.removeProperty('color');
                  else el.style.setProperty('color', originalStyle);
              }
           });
            originalStates.forEach((state, el) => {
              if (state) el.setAttribute('data-state', state);
              else el.removeAttribute('data-state');
          });
        });
    }, 250); // Delay ensures styles are applied and accordions opened
  };


  const parseData = (data: string): SensorData[] => {
    console.log("Parsing data...");
    const lines = data.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    if (lines.length < 2) {
      console.warn("No data rows found after header.");
      return [];
    }
    const headerLine = lines[0].toLowerCase();
    const dataLines = lines.slice(1);

    // Validate header (optional but good practice)
    const expectedHeaders = ['date', 'location', 'water_temperature_c', 'salinity_psu', 'ph_level', 'dissolved_oxygen_mg_l', 'turbidity_ntu', 'nitrate_mg_l'];
    const actualHeaders = headerLine.split(',').map(h => h.trim());
    if (actualHeaders.length !== expectedHeaders.length || !expectedHeaders.every((h, i) => actualHeaders[i].includes(h))) {
      console.warn("CSV header doesn't match expected format exactly. Proceeding, but results might be inaccurate. Expected:", expectedHeaders, "Got:", actualHeaders);
      // Consider throwing an error or showing a more prominent warning if exact match is crucial
    }


    const parsedEntries = dataLines.map((entry, index) => {
      console.log(`Parsing line ${index + 2}: ${entry}`);
      const parts = entry.split(',').map(item => item.trim());
      if (parts.length !== expectedHeaders.length) { // Check against expected length
        console.warn(`Skipping incomplete or malformed entry (line ${index + 2}): ${entry}`);
        return null;
      }

      const [date, location, waterTemperature, salinity, pHLevel, dissolvedOxygen, turbidity, nitrate] = parts;

      // Validate numeric conversions
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
        time: date, // Store original date string
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
        description: 'Please paste or drop sensor data before analyzing.',
        variant: 'destructive',
      });
      return;
    }

     // Validate Lat/Lon/Depth inputs
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
     // --- End Validation ---

    setIsLoading(true);
    setAnalysisProgress(0);
    setAnalysisResults([]);
    progressRef.current = []; // Reset progress history
    lastProgressRef.current = 0; // Reset last recorded progress
    setStartTime(Date.now()); // Record start time for duration calculation
    setTrainedModelInfo(null); // Clear previous model
    setIdentifiedLocationName(null); // Clear previous location name
    remainingTimeRef.current = null; // Reset remaining time estimate
    setRemainingTimeText('Initializing...'); // Initial status message
    console.log("Set loading state, cleared previous results/model, recorded start time.");
    csvDataRef.current = sensorData; // Store raw CSV data if needed

    // Store the validated inputs for display
    setAnalyzedLatitude(latNum);
    setAnalyzedLongitude(lonNum);
    setAnalyzedDepth(depthNum);

    let trainingResult: { model: tf.Sequential; normParams: NormalizationParams } | null = null;
    let normParamsToDispose: NormalizationParams | null = null; // Keep track of tensors to dispose

    // Smooth progress update function
    let frameId: number | null = null;
    const updateProgressSmoothly = (targetProgress: number) => {
        // Clamp target progress between current progress and 100
        const currentProg = lastProgressRef.current; // Use the ref for the source of truth
        const clampedTarget = Math.max(currentProg, Math.min(targetProgress, 100));

        if (currentProg >= clampedTarget) {
            // If already at or beyond target, just update state if needed
            if (currentProg !== analysisProgress) {
                 setAnalysisProgress(currentProg);
            }
            return; // No animation needed
        }

        // Animation step function
        const step = (timestamp: number) => {
           // Increment progress slightly towards the target
           const newProgress = Math.min(lastProgressRef.current + 1, clampedTarget); // Increment by 1% per frame max
           lastProgressRef.current = newProgress; // Update the ref
           setAnalysisProgress(newProgress); // Update the state for UI

           // Continue animation if target not reached
           if (newProgress < clampedTarget) {
               frameId = requestAnimationFrame(step);
           } else {
               frameId = null; // Stop animation
           }
       };

        // Start animation if not already running
        if (frameId === null) {
           frameId = requestAnimationFrame(step);
        }
    };
    // --- End Smooth progress update ---


    try {
      updateProgressSmoothly(1); // Start progress at 1%
      // --- Get Location Name (Optional, based on lat/lon) ---
      try {
        console.log(`Getting location name for Lat: ${latNum}, Lon: ${lonNum}`);
        // Assuming getLocationName is an async function making an API call
        const locationResult = await getLocationName({ latitude: latNum, longitude: lonNum });
        setIdentifiedLocationName(locationResult.locationName);
        console.log("Identified location name:", locationResult.locationName);
        toast({ title: 'Location Identified', description: `Location identified as: ${locationResult.locationName}` });
      } catch (locationError: any) {
        console.error("Error getting location name:", locationError);
        setIdentifiedLocationName("Unknown Location"); // Fallback
        toast({ title: 'Location Error', description: `Could not identify location name: ${locationError.message}`, variant: 'destructive' });
      }
      updateProgressSmoothly(5); // Progress after location attempt
      // --- End Get Location Name ---


      console.log("Parsing sensor data...");
      await new Promise(resolve => setTimeout(resolve, 100)); // Simulate parsing time
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
        setAnalysisProgress(0);
        setRemainingTimeText('');
        return; // Stop analysis
      }
      updateProgressSmoothly(10); // Progress after parsing

      // --- Train TensorFlow Model ---
      console.log("Training model using prediction-model.ts...");
      updateProgressSmoothly(15); // Progress before training starts
      await new Promise(resolve => setTimeout(resolve, 100)); // Simulate prep time

      const trainingStartTime = Date.now();
      trainingResult = await trainPredictionModel(parsedData, (epochProgress) => {
        // Update progress based on training epochs (15% to 45%)
        updateProgressSmoothly(15 + Math.floor(epochProgress * 30));
      });
      const trainingEndTime = Date.now();
      console.log(`Model training took ${(trainingEndTime - trainingStartTime) / 1000}s`);

      setTrainedModelInfo(trainingResult);
      if (trainingResult) {
        normParamsToDispose = trainingResult.normParams; // Store params for later disposal
      }
      updateProgressSmoothly(45); // Progress after training attempt
      // --- End Train Model ---

      console.log("Analyzing each data point for suitability...");
      updateProgressSmoothly(50); // Progress before point analysis
      await new Promise(resolve => setTimeout(resolve, 100)); // Simulate prep time

      const analysisStartTime = Date.now();
      let detailedResults: AnalysisResult[] = parsedData.map((data, index) => {
        console.log(`Analyzing data point ${index}:`, data);
        const { isSuitable, summary, threateningFactors } = analyzeSensorData(
          data,
          sensorDataThresholds
        );
        const suitabilityIndex = calculateSuitabilityIndex(data, sensorDataThresholds);
        console.log(`Analysis for point ${index}: Suitable - ${isSuitable}, Index - ${suitabilityIndex}`);

        // Generate improvement suggestions based on analysis
        let improvements: string[] = [];
         // Prioritize threatening factors
         const specificThreats = Object.entries(threateningFactors)
              .filter(([_, value]) => value) // Get only true (threatening) factors
              .map(([key]) => {
                   // Provide specific suggestions for each threatening factor
                   switch (key) {
                        case 'temperature': return `High/low water temperature detected. Consider measures to stabilize or shade if applicable.`;
                        case 'salinity': return `Salinity is outside safe range. Identify and address sources of freshwater influx or excessive evaporation.`;
                        case 'pHLevel': return `pH level is critically low (acidification). Investigate causes like CO2 absorption or pollution.`;
                        case 'dissolvedOxygen': return `Dissolved oxygen is dangerously low (hypoxia). Enhance water circulation or aeration; reduce organic load.`;
                        case 'turbidity': return `Turbidity is very high, blocking light. Address sediment runoff, dredging activities, or algal blooms.`;
                        case 'nitrate': return `Nitrate level is critically high, risking algal blooms. Control nutrient sources from runoff or sewage.`;
                        default: return `Address critical issues related to ${key}.`; // Fallback
                    }
              });

         if (specificThreats.length > 0) {
             improvements = specificThreats;
         } else {
              // If no threats, check for caution factors from summary
              const cautionsMatch = analyzeSensorData(data, sensorDataThresholds).summary.match(/caution factors: (.*?)\./);
              if (cautionsMatch && cautionsMatch[1]) {
                   const cautionParams = cautionsMatch[1].split(', ');
                   improvements = cautionParams.map(param => {
                       // Provide monitoring suggestions for caution factors
                       if (param.includes('Temp near upper limit')) return `Monitor temperature closely; it's nearing the upper caution limit.`;
                       if (param.includes('Temp near lower limit')) return `Monitor temperature closely; it's nearing the lower caution limit.`;
                       if (param.includes('Salinity in caution zone')) return `Salinity is in the caution zone. Monitor for further deviations.`;
                       if (param.includes('pH near lower limit')) return `pH is nearing the lower caution limit. Monitor for acidification trends.`;
                       if (param.includes('Dissolved oxygen low')) return `Dissolved oxygen is in the caution range. Monitor for potential hypoxia.`;
                       if (param.includes('Turbidity elevated')) return `Turbidity is elevated. Monitor water clarity and potential light reduction.`;
                       if (param.includes('Nitrate elevated')) return `Nitrate level is elevated. Monitor for potential contribution to algal growth.`;
                       return `Monitor parameter: ${param}.`; // Generic fallback
                   });
              } else if (isSuitable) {
                  // If suitable and no cautions
                  improvements = ["Environment appears ideal. Continue regular monitoring."];
              } else {
                   // Fallback if threatening but no specific factors identified (shouldn't happen with current logic)
                   improvements = ["Multiple parameters are outside ideal ranges. Review all sensor data for specific issues."];
              }
         }
         // --- End Improvement Suggestions ---

        // Update progress based on point analysis (50% to 75%)
        const currentTargetProgress = 50 + Math.floor(((index + 1) / parsedData.length) * 25);
        updateProgressSmoothly(currentTargetProgress);


        return {
          ...data,
          isSuitable,
          summary,
          improvements, // Add the generated suggestions
          suitabilityIndex,
          isPrediction: false, // Mark as actual data
        };
      });
      const analysisEndTime = Date.now();
      console.log(`Data point analysis took ${(analysisEndTime - analysisStartTime) / 1000}s`);
      console.log("Finished suitability analysis for all data points.");
      updateProgressSmoothly(75); // Progress after point analysis

      // --- Generate Predictions ---
      if (trainingResult) {
        console.log("Generating predictions using prediction-model.ts...");
        updateProgressSmoothly(80); // Progress before predictions
        await new Promise(resolve => setTimeout(resolve, 100)); // Simulate prep time

        const predictionStartTime = Date.now();
        const numPredictions = 5; // Number of future points to predict
        const predictedResults = await generatePredictions(
          trainingResult.model,
          trainingResult.normParams,
          detailedResults, // Pass current results (including actual data)
          numPredictions,
          (predictionProgress) => {
            // Update progress based on prediction steps (80% to 100%)
            updateProgressSmoothly(80 + Math.floor(predictionProgress * 20));
          }
        );
        const predictionEndTime = Date.now();
        console.log(`Predictions took ${(predictionEndTime - predictionStartTime) / 1000}s`);

        // Combine actual and predicted results
        detailedResults = [...detailedResults, ...predictedResults];

        console.log("Finished predictions.");
      } else {
        console.log("Model training failed or skipped. No predictions will be made.");
        toast({
          title: "Prediction Skipped",
          description: "Model training failed or was skipped, so predictions could not be made.",
          variant: "destructive",
        });
        updateProgressSmoothly(100); // Go straight to 100 if no predictions
      }
      // --- End Predictions ---

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
      setRemainingTimeText(''); // Clear time text on error
    } finally {
      // Cleanup
      if (frameId) cancelAnimationFrame(frameId); // Stop animation if running
      // Dispose normalization tensors ONLY if they exist
      if (normParamsToDispose) {
        tf.dispose([normParamsToDispose.min, normParamsToDispose.max]);
        console.log("Disposed normalization parameter tensors.");
      } else {
        console.warn("Normalization parameters were null or model training failed, cannot dispose.");
      }
      console.log("Analysis process finished. Setting loading state to false.");
      setIsLoading(false); // Set loading false regardless of success/error
      setStartTime(null); // Clear start time
       // Final check to ensure progress bar shows 100% and correct text
       if (analysisProgress >= 99.9) { // Use a threshold slightly below 100
          setAnalysisProgress(100);
          setRemainingTimeText('Analysis complete!');
       } else if (!isLoading) { // If loading finished but not 100%, clear time text
           // Optionally set progress to 0 if error occurred, handled in catch block
       }
    }
  }, [sensorData, toast, latitude, longitude, depth, analysisProgress]); // Add analysisProgress to dependencies for useEffect


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
        setLatitude(position.coords.latitude.toFixed(6));
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
        enableHighAccuracy: true, // Request more accurate position
        timeout: 10000, // Maximum time (in milliseconds) to wait for a position
        maximumAge: 0 // Do not use a cached position
      }
    );
  };

   // --- Drag and Drop Handlers ---
   const handleDragEnter = (e: DragEvent<HTMLTextAreaElement>) => {
     e.preventDefault();
     e.stopPropagation();
     setIsDragging(true);
   };

   const handleDragLeave = (e: DragEvent<HTMLTextAreaElement>) => {
     e.preventDefault();
     e.stopPropagation();
     // Only set isDragging to false if the leave target is outside the drop zone
     // This prevents flickering when moving over child elements
     const relatedTarget = e.relatedTarget as Node;
     if (!e.currentTarget.contains(relatedTarget)) {
        setIsDragging(false);
     }
   };

   const handleDragOver = (e: DragEvent<HTMLTextAreaElement>) => {
     e.preventDefault();
     e.stopPropagation();
     setIsDragging(true); // Keep true while dragging over
     e.dataTransfer.dropEffect = 'copy'; // Indicate copying is allowed
   };

   const handleDrop = (e: DragEvent<HTMLTextAreaElement>) => {
     e.preventDefault();
     e.stopPropagation();
     setIsDragging(false);
     const files = e.dataTransfer.files;

     if (files && files.length > 0) {
        const file = files[0];
        // Check file type
        if (file.type === 'text/csv' || file.name.toLowerCase().endsWith('.csv')) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const fileContent = event.target?.result as string;
                if (fileContent) {
                setSensorData(fileContent); // Update state with file content
                toast({
                    title: 'File Loaded',
                    description: `${file.name} loaded successfully.`,
                });
                } else {
                toast({
                    title: 'File Error',
                    description: 'Could not read file content.',
                    variant: 'destructive',
                });
                }
            };
            reader.onerror = () => {
                toast({
                title: 'File Error',
                description: `Error reading file ${file.name}.`,
                variant: 'destructive',
                });
            };
            reader.readAsText(file); // Read file as text
        } else {
            toast({
                title: 'Invalid File Type',
                description: 'Please drop a valid CSV file (.csv).',
                variant: 'destructive',
            });
        }
     } else {
         // Handle other dropped items if necessary (e.g., text)
         const droppedText = e.dataTransfer.getData('text/plain');
         if (droppedText) {
             setSensorData(droppedText);
             toast({ title: 'Text Pasted', description: 'Data pasted into the text area.' });
         } else {
            toast({
                title: 'Drop Error',
                description: 'No valid file or text found in drop.',
                variant: 'destructive',
            });
         }
     }
   };
   // --- End Drag and Drop Handlers ---


  return (
    // Report ref added to the main container div
    <div ref={reportRef} className="flex flex-col items-center justify-start min-h-screen py-12 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-blue-300 via-blue-400 to-teal-500 text-foreground">
      {/* Render SVG gradients needed for Area charts */}
      {renderGradientDefs(chartConfig, parameters)}


      {/* Header Section */}
      <header className="w-full max-w-5xl mb-8 text-center text-white shadow-lg p-4 rounded-lg bg-black/30 backdrop-blur-sm flex justify-between items-center">
         {/* Centered Title and Info */}
         <div className="flex items-center justify-center flex-grow"> {/* Use flex-grow to allow center alignment */}
            <Fish className="w-10 h-10 mr-3 text-cyan-300 animate-pulse" /> {/* Example icon */}
            <div> {/* Container for text elements */}
                 <h1 className="text-4xl font-bold">CoralGuard</h1>
                 <p className="text-lg text-cyan-100">V2.4 - Mariana</p> {/* Version Info */}
                 <p className="mt-1 text-xs text-blue-200"> {/* Subtext */}
                   Made with love by Senath Sethmika
                 </p>
            </div>
          </div>
          {/* Theme Toggle Button */}
          <ThemeToggle />
      </header>
      {/* End Header Section */}

      <div className="max-w-7xl w-full space-y-8"> {/* Main content container */}

        {/* Input Card */}
        <Card className="bg-white/90 dark:bg-slate-900/90 text-foreground shadow-xl rounded-xl backdrop-blur-md border border-white/30">
          <CardHeader>
            <div className="flex items-center mb-4">
              <Avatar>
                {/* Placeholder image with AI hint */}
                <AvatarImage data-ai-hint="coral reef" src="https://picsum.photos/seed/coralreef/50/50" alt="CoralSafe Logo" className="border-2 border-cyan-300 rounded-full" />
                <AvatarFallback className="bg-cyan-500 text-white">CS</AvatarFallback>
              </Avatar>
              <CardTitle className="ml-4 text-2xl font-semibold text-foreground">CoralSafe: Sensor Data Analyzer</CardTitle>
            </div>

            {/* Use div instead of p for CardDescription content */}
            <CardDescription className="text-muted-foreground text-sm">
               <div className="font-medium mb-1 text-foreground">Paste your CSV sensor data below or drag & drop a CSV file.</div>
               <div className="text-foreground">Expected Format: <code className="bg-black/20 px-1 py-0.5 rounded text-xs">Date,Location,Water_Temperature_C,Salinity_PSU,pH_Level,Dissolved_Oxygen_mg_L,Turbidity_NTU,Nitrate_mg_L</code></div>
             </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Input fields for Lat, Lon, Depth */}
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

                {/* Longitude Input with Fetch Button */}
                <div className="relative"> {/* Relative positioning for button */}
                    <Label htmlFor="longitude" className="text-foreground flex items-center mb-1">
                        <MapPin className="w-4 h-4 mr-1 text-cyan-600 dark:text-cyan-400"/> Longitude
                    </Label>
                     <div className="flex items-center gap-2"> {/* Flex container for input and button */}
                        <Input
                            id="longitude"
                            type="number"
                            placeholder="e.g., 79.8612"
                            value={longitude}
                            onChange={(e) => setLongitude(e.target.value)}
                            className="flex-grow text-sm p-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-inner focus:ring-cyan-500 focus:border-cyan-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" // flex-grow to take available space
                        />
                        <Button
                            onClick={fetchCurrentLocation}
                            disabled={isFetchingLocation}
                            size="icon" // Make button square
                            variant="outline"
                            className="p-2 border-cyan-500 text-cyan-600 hover:bg-cyan-50 dark:border-cyan-400 dark:text-cyan-400 dark:hover:bg-cyan-900/50" // Custom styling
                            title="Fetch Current Location" // Tooltip text
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

            {/* Textarea for CSV data input / Drag & Drop */}
            <Textarea
              placeholder="Example:&#10;2023-01-01,Reef A,26.5,35.2,8.1,6.5,0.8,0.05&#10;2023-01-02,Reef A,26.7,35.1,8.1,6.6,0.7,0.04&#10;Or drop a CSV file here..."
              value={sensorData}
              onChange={(e) => {
                console.log("Sensor data changed:", e.target.value);
                setSensorData(e.target.value);
              }}
              // Drag and Drop Event Handlers
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              className={cn(
                "min-h-[150px] text-sm p-3 border border-gray-300 dark:border-gray-700 rounded-md shadow-inner focus:ring-cyan-500 focus:border-cyan-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 transition-colors duration-200",
                // Conditional styling for drag-over state
                isDragging && "border-cyan-500 bg-cyan-50 dark:bg-cyan-900/30 border-dashed border-2"
              )}
            />
            {/* Analyze Button */}
            <Button
              onClick={analyzeData}
              disabled={isLoading || !sensorData.trim() || !latitude || !longitude || !depth } // Disable if loading or inputs missing
              className="mt-4 w-full bg-cyan-500 text-white hover:bg-cyan-600 disabled:opacity-50 transition-all duration-300 transform hover:scale-105 shadow-md text-lg font-semibold py-3 rounded-lg"
            >
              <Activity className="w-5 h-5 mr-2" /> {isLoading ? 'Analyzing...' : 'Analyze Data'}
            </Button>
            {/* Progress Bar */}
            {isLoading && (
              <div className="w-full px-4 mt-4">
                {/* Progress component displaying analysisProgress */}
                <Progress value={analysisProgress} className="w-full [&>div]:bg-cyan-400 h-2.5 rounded-full bg-white/30" />
                {/* Text showing progress percentage and remaining time */}
                <p className="text-center text-sm text-foreground mt-2">
                  Analysis Progress: {analysisProgress.toFixed(0)}% {remainingTimeText && `(${remainingTimeText})`}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
        {/* End Input Card */}


        {/* Analysis Results Table */}
        {analysisResults.length > 0 && (
          <Card className="bg-white/90 dark:bg-slate-900/90 text-foreground shadow-xl rounded-xl backdrop-blur-md border border-white/30 overflow-hidden">
            <CardHeader className="flex flex-row items-start sm:items-center justify-between pb-2"> {/* Flex layout for header */}
             <div> {/* Container for Title and Description */}
                <CardTitle className="text-xl font-semibold text-foreground">Analysis Results</CardTitle>
                {/* Display location info if available */}
                {(analyzedLatitude !== null && analyzedLongitude !== null && analyzedDepth !== null) && (
                    <CardDescription className="text-sm text-muted-foreground mt-1 flex items-center flex-wrap"> {/* Flex wrap for responsiveness */}
                        <MapPin className="w-4 h-4 mr-1 text-cyan-600 dark:text-cyan-400"/>
                         {/* Show identified location name */}
                         {identifiedLocationName && (
                            <span className="mr-3 text-foreground">{identifiedLocationName}</span>
                        )}
                        {/* Show coordinates */}
                        <span className="mr-3 text-foreground">(Lat: {analyzedLatitude.toFixed(4)}, Lon: {analyzedLongitude.toFixed(4)})</span>
                        {/* Show depth */}
                        <ArrowDownUp className="w-4 h-4 mr-1 text-cyan-600 dark:text-cyan-400"/>
                        <span className="text-foreground">Depth: {analyzedDepth}m</span>
                    </CardDescription>
                )}
              </div>
              {/* Download Report Button */}
              <Button
                onClick={downloadReport}
                className="bg-cyan-500 text-white hover:bg-cyan-600 transition-colors duration-300 shadow-sm mt-2 sm:mt-0" // Adjust margin for mobile
                size="sm"
              >
                <Gauge className="w-4 h-4 mr-2" /> Download Report (PDF)
              </Button>
            </CardHeader>
            <CardContent className="p-0"> {/* Remove padding for table */}
              <div className="overflow-x-auto"> {/* Allow horizontal scrolling on small screens */}
                <Table className="min-w-full"> {/* Ensure table takes minimum full width */}
                  <TableHeader className="bg-cyan-600/10 dark:bg-cyan-400/10"> {/* Header background */}
                    <TableRow className="border-b border-cyan-200/30 dark:border-cyan-700/30"> {/* Bottom border for header row */}
                      <TableHead className="text-left font-medium py-3 px-2 sm:px-4 border-r border-cyan-200/30 dark:border-cyan-700/30 text-foreground">Time</TableHead>
                      <TableHead className="text-left font-medium py-3 px-2 sm:px-4 border-r border-cyan-200/30 dark:border-cyan-700/30 text-foreground">Location</TableHead>
                      {/* Suitability Column */}
                      <TableHead className="text-center font-medium py-3 px-2 sm:px-4 border-r border-cyan-200/30 dark:border-cyan-700/30 text-foreground">Suitability</TableHead>
                      {/* Parameter Columns - Hidden on small screens (sm) */}
                      <TableHead className="text-right font-medium py-3 px-2 sm:px-4 border-r border-cyan-200/30 dark:border-cyan-700/30 text-foreground hidden sm:table-cell">Water Temp (°C)</TableHead>
                      <TableHead className="text-right font-medium py-3 px-2 sm:px-4 border-r border-cyan-200/30 dark:border-cyan-700/30 text-foreground hidden sm:table-cell">Salinity (PSU)</TableHead>
                      <TableHead className="text-right font-medium py-3 px-2 sm:px-4 border-r border-cyan-200/30 dark:border-cyan-700/30 text-foreground hidden sm:table-cell">pH Level</TableHead>
                      <TableHead className="text-right font-medium py-3 px-2 sm:px-4 border-r border-cyan-200/30 dark:border-cyan-700/30 text-foreground hidden sm:table-cell">Oxygen (mg/L)</TableHead>
                      <TableHead className="text-right font-medium py-3 px-2 sm:px-4 border-r border-cyan-200/30 dark:border-cyan-700/30 text-foreground hidden sm:table-cell">Turbidity (NTU)</TableHead>
                      <TableHead className="text-right font-medium py-3 px-2 sm:px-4 border-r border-cyan-200/30 dark:border-cyan-700/30 text-foreground hidden sm:table-cell">Nitrate (mg/L)</TableHead>
                      {/* Summary and Actions Columns */}
                      <TableHead className="text-left font-medium py-3 px-2 sm:px-4 border-r border-cyan-200/30 dark:border-cyan-700/30 text-foreground">Summary</TableHead>
                      <TableHead className="text-left font-medium py-3 px-2 sm:px-4 text-foreground">Suggested Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {analysisResults.map((result, index) => {
                      const isPrediction = result.isPrediction === true;
                      let suitabilityClass = ''; // CSS class for suitability badge
                      let suitabilityText = ''; // Text for suitability badge
                      // Display suitability index if available and not a prediction
                      let suitabilityIndexText = result.suitabilityIndex !== undefined && !isPrediction ? `(${result.suitabilityIndex.toFixed(0)})` : '';


                      // Determine suitability styling based on index or prediction status
                      if (isPrediction) {
                        suitabilityClass = 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-300';
                        suitabilityText = 'Prediction';
                      } else {
                        if (result.suitabilityIndex === undefined) { // Handle cases where index might be missing
                          suitabilityClass = 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-300';
                          suitabilityText = 'Unknown';
                        } else if (result.suitabilityIndex >= 80) { // Ideal range
                          suitabilityClass = 'bg-green-200 dark:bg-green-800/50 text-green-800 dark:text-green-200';
                          suitabilityText = 'Suitable';
                        } else if (result.suitabilityIndex >= 50) { // Caution range
                          suitabilityClass = 'bg-yellow-200 dark:bg-yellow-800/50 text-yellow-800 dark:text-yellow-200';
                          suitabilityText = 'Warning';
                        } else { // Threatening range
                          suitabilityClass = 'bg-red-200 dark:bg-red-800/50 text-red-800 dark:text-red-200';
                          suitabilityText = 'Threatening';
                        }
                      }


                      return (
                        <TableRow key={index} className="border-b border-cyan-200/30 dark:border-cyan-700/30 last:border-0 hover:bg-cyan-500/10 dark:hover:bg-cyan-400/10 transition-colors duration-150">
                          {/* Data Cells */}
                          <TableCell className="py-2 border-r border-cyan-200/30 dark:border-cyan-700/30 px-2 sm:px-4 text-foreground">{result.time}</TableCell>
                          <TableCell className="py-2 border-r border-cyan-200/30 dark:border-cyan-700/30 px-2 sm:px-4 text-foreground">{result.location}</TableCell>
                          {/* Suitability Badge Cell */}
                          <TableCell className={`py-2 text-center border-r border-cyan-200/30 dark:border-cyan-700/30 px-2 sm:px-4`}>
                            <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium shadow-sm ${suitabilityClass}`}>
                              {suitabilityText} {suitabilityIndexText} {/* Display text and index */}
                            </span>
                          </TableCell>
                          {/* Parameter Data Cells - Hidden on small screens */}
                          <TableCell className="py-2 text-right border-r border-cyan-200/30 dark:border-cyan-700/30 px-2 sm:px-4 text-foreground hidden sm:table-cell">{result.waterTemperature.toFixed(2)}</TableCell>
                          <TableCell className="py-2 text-right border-r border-cyan-200/30 dark:border-cyan-700/30 px-2 sm:px-4 text-foreground hidden sm:table-cell">{result.salinity.toFixed(2)}</TableCell>
                          <TableCell className="py-2 text-right border-r border-cyan-200/30 dark:border-cyan-700/30 px-2 sm:px-4 text-foreground hidden sm:table-cell">{result.pHLevel.toFixed(2)}</TableCell>
                          <TableCell className="py-2 text-right border-r border-cyan-200/30 dark:border-cyan-700/30 px-2 sm:px-4 text-foreground hidden sm:table-cell">{result.dissolvedOxygen.toFixed(2)}</TableCell>
                          <TableCell className="py-2 text-right border-r border-cyan-200/30 dark:border-cyan-700/30 px-2 sm:px-4 text-foreground hidden sm:table-cell">{result.turbidity.toFixed(2)}</TableCell>
                          <TableCell className="py-2 text-right border-r border-cyan-200/30 dark:border-cyan-700/30 px-2 sm:px-4 text-foreground hidden sm:table-cell">{result.nitrate.toFixed(2)}</TableCell>
                          {/* Summary Accordion Cell */}
                          <TableCell className="py-2 border-r border-cyan-200/30 dark:border-cyan-700/30 px-2 sm:px-4">
                            <Accordion type="single" collapsible className="w-full">
                              <AccordionItem value={`summary-${index}`} className="border-b-0">
                                {/* Added data attributes for PDF generation targeting */}
                                <AccordionTrigger data-summary-trigger className="py-1 text-xs hover:no-underline [&>svg]:text-cyan-500 text-foreground">View</AccordionTrigger>
                                <AccordionContent data-summary-content className="text-xs pt-1 pb-2 text-muted-foreground">
                                  {result.summary || 'N/A'}
                                </AccordionContent>
                              </AccordionItem>
                            </Accordion>
                          </TableCell>
                          {/* Suggested Actions Accordion Cell */}
                          <TableCell className="py-2 px-2 sm:px-4">
                            <Accordion type="single" collapsible className="w-full">
                              <AccordionItem value={`actions-${index}`} className="border-b-0">
                                 {/* Added data attributes for PDF generation targeting */}
                                <AccordionTrigger data-actions-trigger className="py-1 text-xs hover:no-underline [&>svg]:text-cyan-500 text-foreground">View Actions</AccordionTrigger>
                                <AccordionContent data-actions-content>
                                  {/* Display actions as an unordered list */}
                                  <ul className="list-disc pl-5 text-xs space-y-1 text-muted-foreground">
                                    {result.improvements && result.improvements.length > 0 ? (
                                      result.improvements.map((improvement, i) => (
                                        <li key={i}>{improvement}</li> // List item for each suggestion
                                      ))
                                    ) : (
                                      // Fallback message if no actions
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
        {/* End Analysis Results Table */}


        {/* Charts Section */}
        {analysisResults.length > 0 && (
          <Accordion type="multiple" className="w-full space-y-4"> {/* Allow multiple sections open */}
             {/* Suitability Index Chart */}
             <AccordionItem value="suitabilityIndex" key="suitabilityIndex" className="border-none">
                <Card className="bg-white/90 dark:bg-slate-900/90 text-foreground shadow-xl rounded-xl backdrop-blur-md border border-white/30 overflow-hidden">
                  {/* Added data attributes for PDF generation targeting */}
                  <AccordionTrigger data-graph-trigger className="text-lg font-medium p-4 hover:no-underline hover:bg-cyan-500/10 dark:hover:bg-cyan-400/10 transition-colors duration-150 rounded-t-xl w-full flex items-center justify-between text-foreground">
                    <div className="flex items-center">
                      <TrendingUp className="w-5 h-5 mr-2 text-cyan-500" />
                      Overall Suitability Index Trends
                    </div>
                  </AccordionTrigger>
                  <AccordionContent data-graph-content className="p-2 sm:p-4 border-t border-cyan-200/30 dark:border-cyan-700/30">
                    <p className="text-sm text-muted-foreground mb-4 text-foreground">
                      Visualizing the overall Suitability Index (0-100) over time. Predictions are not available for this metric.
                    </p>
                    {/* Chart Container for Responsiveness */}
                    <ChartContainer config={chartConfig} className="aspect-video h-[250px] sm:h-[300px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                          data={analysisResults.filter(d => !d.isPrediction)} // Exclude predictions for suitability index
                          margin={{ top: 5, right: 10, left: -10, bottom: 5 }} // Adjusted margins for mobile
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.5)" />
                          <XAxis dataKey="time" stroke="hsl(var(--foreground))" tick={{ fontSize: 10, fill: 'hsl(var(--foreground))' }} axisLine={false} tickLine={false} padding={{ left: 10, right: 10 }} />
                          <YAxis domain={[0, 100]} stroke="hsl(var(--foreground))" tick={{ fontSize: 10, fill: 'hsl(var(--foreground))' }} axisLine={false} tickLine={false} />
                          {/* Tooltip Configuration */}
                          <RechartsTooltip
                            content={
                              <ChartTooltipContent
                                indicator="dot"
                                labelClassName="text-sm font-medium text-foreground"
                                className="rounded-lg border border-border/50 bg-background/90 p-2 shadow-lg backdrop-blur-sm text-foreground"
                                // Format tooltip to show suitability index
                                formatter={(value, name, props) => [`${(value as number).toFixed(0)}`, chartConfig.suitabilityIndex?.label]}
                              />
                            }
                            cursor={{ stroke: "hsl(var(--accent))", strokeWidth: 1, strokeDasharray: "3 3" }}
                          />
                           {/* Legend Configuration */}
                           <RechartsLegend content={ <ChartLegendContent
                                payload={
                                    Object.entries(chartConfig)
                                    .filter(([key]) => key === 'suitabilityIndex') // Only show suitability index in legend
                                    .map(([key, config]) => ({
                                        value: config.label,
                                        type: 'line',
                                        id: key,
                                        color: config.color,
                                        icon: config.icon
                                    }))
                                }
                                className="text-foreground text-xs" // Smaller legend text for mobile
                             /> }
                            />

                           {/* Line definition for Suitability Index */}
                           <Line
                             key={`suitabilityIndex-line`}
                             dataKey='suitabilityIndex'
                             type="linear" // Linear interpolation between points
                             stroke="#000000" // Use black stroke for the line
                             strokeWidth={1.5} // Line thickness
                             dot={{ fill: chartConfig.suitabilityIndex?.color || 'hsl(var(--primary))', r: 3, strokeWidth: 0 }} // Smaller dots
                             activeDot={{ r: 5, strokeWidth: 1, fill: chartConfig.suitabilityIndex?.color || 'hsl(var(--primary))', stroke: 'hsl(var(--foreground))' }} // Style for active dot
                             name={chartConfig.suitabilityIndex?.label || "Suitability Index"}
                             isAnimationActive={false} // Disable animation
                             connectNulls={false} // Do not connect points across null values
                           />
                        </LineChart>
                      </ResponsiveContainer>
                    </ChartContainer>
                  </AccordionContent>
                </Card>
              </AccordionItem>
              {/* End Suitability Index Chart */}


            {/* Parameter Trend Charts */}
            {parameters.map((parameter) => (
              <AccordionItem value={parameter.key} key={parameter.key} className="border-none">
                <Card className="bg-white/90 dark:bg-slate-900/90 text-foreground shadow-xl rounded-xl backdrop-blur-md border border-white/30 overflow-hidden">
                  {/* Added data attributes for PDF generation targeting */}
                  <AccordionTrigger data-graph-trigger className="text-lg font-medium p-4 hover:no-underline hover:bg-cyan-500/10 dark:hover:bg-cyan-400/10 transition-colors duration-150 rounded-t-xl w-full flex items-center justify-between text-foreground">
                    <div className="flex items-center">
                      {/* Use parameter-specific icon */}
                      <parameter.icon className="w-5 h-5 mr-2 text-cyan-500" />
                       {parameter.name} Trends
                    </div>
                  </AccordionTrigger>
                  <AccordionContent data-graph-content className="p-2 sm:p-4 border-t border-cyan-200/30 dark:border-cyan-700/30">
                    <p className="text-sm text-muted-foreground mb-4 text-foreground">
                      Visualizing {parameter.name} ({parameter.unit}) over time, including predicted values.
                    </p>
                    {/* Chart Container */}
                    <ChartContainer config={chartConfig} className="aspect-video h-[250px] sm:h-[300px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                          data={analysisResults} // Use combined actual and predicted data
                          margin={{ top: 5, right: 10, left: -10, bottom: 5 }} // Adjusted margins
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.5)" />
                          <XAxis dataKey="time" stroke="hsl(var(--foreground))" tick={{ fontSize: 10, fill: 'hsl(var(--foreground))' }} axisLine={false} tickLine={false} padding={{ left: 10, right: 10 }} />
                          <YAxis stroke="hsl(var(--foreground))" tick={{ fontSize: 10, fill: 'hsl(var(--foreground))' }} axisLine={false} tickLine={false} domain={['auto', 'auto']} /> {/* Auto domain */}
                          {/* Tooltip Configuration */}
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
                           {/* Legend Configuration */}
                           <RechartsLegend content={ <ChartLegendContent
                                payload={
                                    Object.entries(chartConfig)
                                    // Filter legend items for the current parameter and the prediction line
                                    .filter(([key]) => key === parameter.key || key === 'prediction')
                                    .map(([key, config]) => ({
                                        value: config.label,
                                        type: key === 'prediction' ? 'dashed' : 'line', // Dashed for prediction line
                                        id: key,
                                        // Use specific parameter color or prediction color
                                        color: key === 'prediction' ? config.color : chartConfig[parameter.key]?.color,
                                        icon: config.icon
                                    }))
                                }
                                className="text-foreground text-xs" // Smaller legend text
                             /> }
                            />

                            {/* Line for Actual Data */}
                            <Line
                                key={`${parameter.key}-actual-line`}
                                // Use dataKey function to conditionally render points (null for predictions)
                                dataKey={(payload: AnalysisResult) => payload.isPrediction ? null : payload[parameter.key as keyof SensorData]}
                                type="linear"
                                stroke="#000000" // Black line
                                strokeWidth={1.5}
                                // Dot style - use parameter's color
                                dot={{ fill: chartConfig[parameter.key]?.color || 'hsl(var(--foreground))', r: 3, strokeWidth: 0 }}
                                activeDot={{ r: 5, strokeWidth: 1, fill: chartConfig[parameter.key]?.color || 'hsl(var(--foreground))', stroke: 'hsl(var(--foreground))' }}
                                name={chartConfig[parameter.key]?.label || parameter.name}
                                isAnimationActive={false}
                                connectNulls={false} // Do not connect across prediction gaps
                             />

                           {/* Line for Predicted Data (Dashed) */}
                           <Line
                                key={`${parameter.key}-prediction-line`}
                                // DataKey function: include predicted points and the last actual point to connect
                                dataKey={(payload: AnalysisResult, index: number) => {
                                   const firstPredictionIndex = analysisResults.findIndex(d => d.isPrediction === true);
                                   // Include if it's a prediction OR if it's the last actual point before predictions start
                                   if (payload.isPrediction || (firstPredictionIndex !== -1 && index === firstPredictionIndex - 1)) {
                                       return payload[parameter.key as keyof SensorData];
                                   }
                                   return null; // Exclude other actual points
                                }}
                                type="linear"
                                stroke="#000000" // Black line
                                strokeWidth={1.5}
                                strokeDasharray="5 5" // Make the line dashed
                                // Dot style for predictions - use prediction color
                                dot={{ fill: chartConfig.prediction.color, r: 3, strokeWidth: 0 }}
                                activeDot={false} // No special style for active prediction dots
                                name={`${chartConfig[parameter.key]?.label || parameter.name} (Pred.)`}
                                isAnimationActive={false}
                                connectNulls={true} // Connect the prediction points including the gap from actual data
                           />
                        </LineChart>
                      </ResponsiveContainer>
                    </ChartContainer>
                  </AccordionContent>
                </Card>
              </AccordionItem>
            ))}
            {/* End Parameter Trend Charts */}

            {/* Average Parameter Values Chart */}
            <AccordionItem value="distribution" key="distribution" className="border-none">
                <Card className="bg-white/90 dark:bg-slate-900/90 text-foreground shadow-xl rounded-xl backdrop-blur-md border border-white/30 overflow-hidden">
                  {/* Added data attributes for PDF generation targeting */}
                  <AccordionTrigger data-graph-trigger className="text-lg font-medium p-4 hover:no-underline hover:bg-cyan-500/10 dark:hover:bg-cyan-400/10 transition-colors duration-150 rounded-t-xl w-full flex items-center justify-between text-foreground">
                    <div className="flex items-center">
                      <BarChartBig className="w-5 h-5 mr-2 text-cyan-500" />
                      Average Parameter Values
                    </div>
                  </AccordionTrigger>
                  <AccordionContent data-graph-content className="p-2 sm:p-4 border-t border-cyan-200/30 dark:border-cyan-700/30">
                    <p className="text-sm text-muted-foreground mb-4 text-foreground">
                      Average values for each parameter across the observed data points (excluding predictions).
                    </p>
                    <ChartContainer config={chartConfig} className="aspect-video h-[300px] sm:h-[300px] w-full"> {/* Consistent height */}
                      <ResponsiveContainer width="100%" height="100%">
                         {(() => {
                             // Calculate averages only from actual data
                             const actualData = analysisResults.filter(d => !d.isPrediction);
                             const averages = parameters.map(param => {
                                 const sum = actualData.reduce((acc, curr) => acc + (curr[param.key as keyof SensorData] as number || 0), 0);
                                 const avg = actualData.length > 0 ? sum / actualData.length : 0;
                                 return {
                                     name: chartConfig[param.key]?.label || param.name, // Use label from config
                                     value: avg,
                                     fill: chartConfig[param.key]?.color || 'hsl(var(--foreground))' // Use color from config
                                 };
                             });

                             return (
                                 // Use BarChart for vertical bars or AreaChart for horizontal
                                 <ResponsiveContainer width="100%" height="100%">
                                     <BarChart
                                        data={averages}
                                        layout="vertical" // Horizontal bars
                                        margin={{ top: 5, right: 20, left: 10, bottom: 5 }} // Adjusted margins
                                    >
                                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.5)" horizontal={false}/> {/* Vertical grid lines */}
                                        <XAxis type="number" stroke="hsl(var(--foreground))" tick={{ fontSize: 10, fill: 'hsl(var(--foreground))' }} axisLine={false} tickLine={false} />
                                        <YAxis dataKey="name" type="category" stroke="hsl(var(--foreground))" tick={{ fontSize: 9, fill: 'hsl(var(--foreground))' }} axisLine={false} tickLine={false} width={100} sm={{width: 150}}/> {/* Category axis (parameter names) */}
                                        {/* Tooltip Configuration */}
                                        <RechartsTooltip
                                            content={
                                                <ChartTooltipContent
                                                    labelClassName="text-sm font-medium text-foreground"
                                                    className="rounded-lg border border-border/50 bg-background/90 p-2 shadow-lg backdrop-blur-sm text-foreground"
                                                    // Format tooltip to show average value
                                                    formatter={(value, name) => [`${(value as number).toFixed(2)}`, name]}
                                                    cursor={{ fill: 'hsl(var(--accent)/0.2)' }}
                                                />
                                            }
                                        />
                                         {/* Bar definition */}
                                         <Bar dataKey="value" radius={[4, 4, 0, 0]}> {/* Rounded corners */}
                                           {/* Use Cell to apply color based on data */}
                                           {averages.map((entry, index) => (
                                             <Cell key={`cell-${index}`} fill={entry.fill} />
                                           ))}
                                         </Bar>
                                     </BarChart>
                                 </ResponsiveContainer>
                             );
                         })()}
                      </ResponsiveContainer>
                    </ChartContainer>
                  </AccordionContent>
                </Card>
            </AccordionItem>
            {/* End Average Parameter Values Chart */}


          </Accordion>
        )}
        {/* End Charts Section */}


        {/* Parameter Ranges Table */}
        {analysisResults.length > 0 && (
          <Card className="mt-8 bg-white/90 dark:bg-slate-900/90 text-foreground shadow-xl rounded-xl backdrop-blur-md border border-white/30 overflow-hidden">
            <CardHeader>
              <CardTitle className="text-xl font-semibold text-foreground">Parameter Ranges for Coral Health</CardTitle>
              <CardDescription className="text-muted-foreground text-sm text-foreground">Reference thresholds for ideal, caution, and threatening conditions.</CardDescription>
            </CardHeader>
            <CardContent className="p-0"> {/* Remove padding for table */}
              <div className="overflow-x-auto"> {/* Allow horizontal scrolling */}
                <Table className="min-w-full text-xs sm:text-sm"> {/* Smaller text on mobile */}
                  <TableHeader className="bg-cyan-600/10 dark:bg-cyan-400/10">
                    <TableRow className="border-b border-cyan-200/30 dark:border-cyan-700/30">
                      <TableHead className="text-left font-medium py-2 px-2 sm:px-4 border-r border-cyan-200/30 dark:border-cyan-700/30 text-foreground">Parameter</TableHead>
                      {/* Use colored backgrounds for Ideal, Caution, Threatening headers */}
                      <TableHead className="text-center font-medium py-2 px-2 sm:px-4 border-r border-cyan-200/30 dark:border-cyan-700/30 bg-green-100/50 dark:bg-green-900/50 text-green-800 dark:text-green-200">Ideal</TableHead>
                      <TableHead className="text-center font-medium py-2 px-2 sm:px-4 border-r border-cyan-200/30 dark:border-cyan-700/30 bg-yellow-100/50 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-200">Caution</TableHead>
                      <TableHead className="text-center font-medium py-2 px-2 sm:px-4 bg-red-100/50 dark:bg-red-900/50 text-red-800 dark:text-red-200">Threatening</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {/* Rows defining the ranges for each parameter */}
                    <TableRow className="border-b border-cyan-200/30 dark:border-cyan-700/30">
                      <TableCell className="font-medium border-r border-cyan-200/30 dark:border-cyan-700/30 py-2 px-2 sm:px-4 text-foreground">Temp (°C)</TableCell>
                      <TableCell className="text-center border-r border-cyan-200/30 dark:border-cyan-700/30 py-2 px-2 sm:px-4 text-foreground">24-28</TableCell>
                      <TableCell className="text-center border-r border-cyan-200/30 dark:border-cyan-700/30 py-2 px-2 sm:px-4 text-foreground">28-30</TableCell>
                      <TableCell className="text-center py-2 px-2 sm:px-4 text-foreground">&gt; 30</TableCell>
                    </TableRow>
                    <TableRow className="border-b border-cyan-200/30 dark:border-cyan-700/30">
                      <TableCell className="font-medium border-r border-cyan-200/30 dark:border-cyan-700/30 py-2 px-2 sm:px-4 text-foreground">Salinity (PSU)</TableCell>
                      <TableCell className="text-center border-r border-cyan-200/30 dark:border-cyan-700/30 py-2 px-2 sm:px-4 text-foreground">33-36</TableCell>
                      <TableCell className="text-center border-r border-cyan-200/30 dark:border-cyan-700/30 py-2 px-2 sm:px-4 text-foreground">31-33 or 36-38</TableCell>
                      <TableCell className="text-center py-2 px-2 sm:px-4 text-foreground">&lt; 31 or &gt; 38</TableCell>
                    </TableRow>
                    <TableRow className="border-b border-cyan-200/30 dark:border-cyan-700/30">
                      <TableCell className="font-medium border-r border-cyan-200/30 dark:border-cyan-700/30 py-2 px-2 sm:px-4 text-foreground">pH Level</TableCell>
                      <TableCell className="text-center border-r border-cyan-200/30 dark:border-cyan-700/30 py-2 px-2 sm:px-4 text-foreground">8.0-8.3</TableCell>
                      <TableCell className="text-center border-r border-cyan-200/30 dark:border-cyan-700/30 py-2 px-2 sm:px-4 text-foreground">7.8-8.0</TableCell>
                      <TableCell className="text-center py-2 px-2 sm:px-4 text-foreground">&lt; 7.8</TableCell>
                    </TableRow>
                    <TableRow className="border-b border-cyan-200/30 dark:border-cyan-700/30">
                      <TableCell className="font-medium border-r border-cyan-200/30 dark:border-cyan-700/30 py-2 px-2 sm:px-4 text-foreground">Oxygen (mg/L)</TableCell>
                      <TableCell className="text-center border-r border-cyan-200/30 dark:border-cyan-700/30 py-2 px-2 sm:px-4 text-foreground">&gt; 6.0</TableCell>
                      <TableCell className="text-center border-r border-cyan-200/30 dark:border-cyan-700/30 py-2 px-2 sm:px-4 text-foreground">4.0-6.0</TableCell>
                      <TableCell className="text-center py-2 px-2 sm:px-4 text-foreground">&lt; 4.0</TableCell>
                    </TableRow>
                    <TableRow className="border-b border-cyan-200/30 dark:border-cyan-700/30">
                      <TableCell className="font-medium border-r border-cyan-200/30 dark:border-cyan-700/30 py-2 px-2 sm:px-4 text-foreground">Turbidity (NTU)</TableCell>
                      <TableCell className="text-center border-r border-cyan-200/30 dark:border-cyan-700/30 py-2 px-2 sm:px-4 text-foreground">&lt; 1.0</TableCell>
                      <TableCell className="text-center border-r border-cyan-200/30 dark:border-cyan-700/30 py-2 px-2 sm:px-4 text-foreground">1.0-3.0</TableCell>
                      <TableCell className="text-center py-2 px-2 sm:px-4 text-foreground">&gt; 3.0</TableCell>
                    </TableRow>
                    <TableRow className="border-b-0"> {/* Remove border from last row */}
                      <TableCell className="font-medium border-r border-cyan-200/30 dark:border-cyan-700/30 py-2 px-2 sm:px-4 text-foreground">Nitrate (mg/L)</TableCell>
                      <TableCell className="text-center border-r border-cyan-200/30 dark:border-cyan-700/30 py-2 px-2 sm:px-4 text-foreground">&lt; 0.1</TableCell>
                      <TableCell className="text-center border-r border-cyan-200/30 dark:border-cyan-700/30 py-2 px-2 sm:px-4 text-foreground">0.1-0.3</TableCell>
                      <TableCell className="text-center py-2 px-2 sm:px-4 text-foreground">&gt; 0.3</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}
        {/* End Parameter Ranges Table */}


         {/* Location & Depth Visualization Card */}
         <Card className={cn(
              "mt-8 bg-white/90 dark:bg-slate-900/90 text-foreground shadow-xl rounded-xl backdrop-blur-md border border-white/30 overflow-hidden",
              // Hide card if results are empty or location/depth not analyzed
              !(analysisResults.length > 0 && analyzedLatitude !== null && analyzedLongitude !== null && analyzedDepth !== null) && "hidden"
         )}>
             <CardHeader>
                <CardTitle className="text-xl font-semibold text-foreground">Location & Depth Visualization</CardTitle>
                <CardDescription className="text-muted-foreground text-sm text-foreground">Depth representation based on provided depth.</CardDescription>
             </CardHeader>
             {/* Render content only when data is available */}
             {(analysisResults.length > 0 && analyzedLatitude !== null && analyzedLongitude !== null && analyzedDepth !== null) && (
                 <CardContent className="p-4 flex flex-col sm:flex-row justify-center items-center gap-4">
                     {/* Depth Visualization Component */}
                     <div className="flex flex-col items-center w-full sm:w-auto"> {/* Center content */}
                          <h3 className="text-lg font-medium mb-2 text-foreground">Depth Representation</h3>
                          {/* Container with fixed size for D3 visualization */}
                          <div className="w-[200px] h-[300px]">
                             {/* Pass analyzed depth to the component */}
                             <DepthVisualization depth={analyzedDepth} />
                          </div>
                      </div>
                      {/* Removed Map Visualization */}
                 </CardContent>
             )}
         </Card>
         {/* End Location & Depth Visualization Card */}


      </div> {/* End Main Content Container */}


      {/* Footer Section */}
      <footer className="w-full max-w-5xl mt-12 text-center text-white/70 text-xs p-4">
         {/* Copyright and Disclaimer */}
         <p>© 2025 CoralGuard by Senath Sethmika. All rights reserved.</p>
         <p>Data analysis for educational and scientific purposes only.</p>
         {/* Social Media Links */}
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
      {/* End Footer Section */}


    </div> // End Main Container div
  );
}
