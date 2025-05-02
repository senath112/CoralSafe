
'use client';

import {useState, useCallback, useRef, useEffect} from 'react';
import {Button} from '@/components/ui/button';
import {Textarea} from '@/components/ui/textarea';
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '@/components/ui/card';
import {Avatar, AvatarImage, AvatarFallback} from '@/components/ui/avatar';
import {Alert, AlertDescription, AlertTitle} from '@/components/ui/alert';
import {defineSensorDataThresholds, analyzeSensorData, calculateSuitabilityIndex} from '@/lib/utils';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from '@/components/ui/chart';
import type { ChartConfig } from "@/components/ui/chart";
import {LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend as RechartsLegend, ResponsiveContainer} from 'recharts';
import {Progress} from "@/components/ui/progress";
import {Accordion, AccordionContent, AccordionItem, AccordionTrigger} from "@/components/ui/accordion";
import * as tf from '@tensorflow/tfjs'; // Still needed for tf.dispose
import {useToast} from "@/hooks/use-toast";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
} from "@/components/ui/table";
import {jsPDF} from 'jspdf';
import html2canvas from 'html2canvas';
import Link from 'next/link';
import { Fish, Waves, Droplet, Thermometer, Beaker, Wind, CloudFog, Activity, Gauge } from 'lucide-react';
// Import functions from the new prediction model file
import { trainPredictionModel, generatePredictions, type NormalizationParams } from '@/lib/prediction-model';


// Keep these interfaces here or move them to a central types file (e.g., src/types.ts)
export interface SensorData {
  time: string;
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
  {name: 'Water Temperature', key: 'waterTemperature', unit: '°C', icon: Thermometer},
  {name: 'Salinity', key: 'salinity', unit: 'PSU', icon: Waves},
  {name: 'pH Level', key: 'pHLevel', unit: '', icon: Beaker},
  {name: 'Dissolved Oxygen', key: 'dissolvedOxygen', unit: 'mg/L', icon: Wind},
  {name: 'Turbidity', key: 'turbidity', unit: 'NTU', icon: CloudFog},
  {name: 'Nitrate', key: 'nitrate', unit: 'mg/L', icon: Droplet},
];

const chartConfig: ChartConfig = {
  waterTemperature: {label: "Water Temp (°C)", color: "hsl(var(--chart-1))", icon: Thermometer},
  salinity: {label: "Salinity (PSU)", color: "hsl(var(--chart-2))", icon: Waves},
  pHLevel: {label: "pH Level", color: "hsl(var(--chart-3))", icon: Beaker},
  dissolvedOxygen: {label: "Dissolved Oxygen (mg/L)", color: "hsl(var(--chart-4))", icon: Wind},
  turbidity: {label: "Turbidity (NTU)", color: "hsl(var(--chart-5))", icon: CloudFog},
  nitrate: {label: "Nitrate (mg/L)", color: "hsl(var(--accent))", icon: Droplet},
  prediction: {label: "Prediction", color: "hsl(var(--muted-foreground))", icon: () => <path d="M3 3v18h18" fill="none" strokeDasharray="2,2" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" className="stroke-muted-foreground"/>},
} satisfies ChartConfig;

export default function Home() {
  const [sensorData, setSensorData] = useState<string>('');
  const [analysisResults, setAnalysisResults] = useState<AnalysisResult[]>([]);
  // Store the trained model and normalization parameters
  const [trainedModelInfo, setTrainedModelInfo] = useState<{ model: tf.Sequential; normParams: NormalizationParams } | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [analysisProgress, setAnalysisProgress] = useState<number>(0);
  const {toast} = useToast();

  const csvDataRef = useRef<string>('');
  const reportRef = useRef<HTMLDivElement>(null);

  const [startTime, setStartTime] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState<number>(0);
  const [remainingTimeText, setRemainingTimeText] = useState<string>('');
  const lastProgressRef = useRef<number>(0); // Ref to track last progress value
  const lastRemainingTimeRef = useRef<string>(''); // Ref to track the last valid remaining time

  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null;

    if (isLoading && startTime !== null) {
      intervalId = setInterval(() => {
        const now = Date.now();
        const elapsed = now - startTime;
        setElapsedTime(elapsed);

        const currentProgress = analysisProgress; // Use state value

        if (currentProgress > 0 && currentProgress < 100) {
          // Only update estimate if progress has increased
          if (currentProgress > lastProgressRef.current) {
            const totalEstimatedTime = elapsed / (currentProgress / 100);
            const remainingTimeMs = totalEstimatedTime - elapsed;
            const remainingSeconds = Math.max(0, Math.round(remainingTimeMs / 1000));
            const minutes = Math.floor(remainingSeconds / 60);
            const seconds = remainingSeconds % 60;
            let newRemainingTimeText = '';
            if (minutes > 0) {
              newRemainingTimeText = `~${minutes}m ${seconds}s left`;
            } else {
              newRemainingTimeText = `~${seconds}s left`;
            }
            setRemainingTimeText(newRemainingTimeText);
            lastRemainingTimeRef.current = newRemainingTimeText; // Store the new valid estimate
          } else {
            // If progress hasn't increased, keep showing the last valid estimate
            setRemainingTimeText(lastRemainingTimeRef.current);
          }
          lastProgressRef.current = currentProgress; // Update last progress ref
        } else if (currentProgress === 0) {
          setRemainingTimeText('Estimating time...');
          lastProgressRef.current = 0; // Reset ref at the beginning
          lastRemainingTimeRef.current = 'Estimating time...'; // Reset ref
        } else { // Progress is 100
          setRemainingTimeText('Finishing up...');
        }
      }, 1000);
    } else {
      setElapsedTime(0);
      if (analysisProgress === 100) {
        setRemainingTimeText('Analysis complete!');
      } else {
        setRemainingTimeText(''); // Clear time text if not loading or analysis incomplete
      }
      lastProgressRef.current = 0; // Reset ref when not loading
      lastRemainingTimeRef.current = ''; // Reset ref
    }

    // Cleanup function
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
      // Don't reset refs here, they are handled based on loading state changes
    };
  }, [isLoading, startTime, analysisProgress]); // Depend on analysisProgress


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

    // Temporarily force light theme for PDF generation for better contrast
    const originalTheme = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
    document.documentElement.classList.remove('dark');

    const originalColors = new Map<HTMLElement | SVGTextElement | SVGTSpanElement, string>();
    const elementsToColor = input.querySelectorAll<HTMLElement | SVGTextElement | SVGTSpanElement>(
      'p, span, h1, h2, h3, h4, h5, h6, li, th, td, code, div:not(.bg-green-200):not(.bg-yellow-200):not(.bg-red-200):not(.bg-gray-200), text, tspan'
    );

    elementsToColor.forEach(el => {
        const elClasses = el.classList;
        const hasBgClass = ['bg-green-200', 'bg-yellow-200', 'bg-red-200', 'bg-gray-200'].some(cls => elClasses.contains(cls));

        if (!hasBgClass) {
             originalColors.set(el, el.style.fill || el.style.color);
             if (el instanceof SVGTextElement || el instanceof SVGTSpanElement) {
                 el.style.fill = 'black'; // Force black for SVG text elements
                 el.style.color = '';
             } else {
                 el.style.color = 'black'; // Force black for regular elements
                 el.style.fill = '';
             }
        }
    });

    // Ensure accordions are expanded for the PDF
    const accordions = input.querySelectorAll<HTMLElement>('[data-state="closed"]');
    accordions.forEach(acc => acc.setAttribute('data-state', 'open'));

    setTimeout(() => {
        html2canvas(input, {
            scale: 2,
            useCORS: true,
            backgroundColor: '#ffffff', // Force white background
            // Ensure text rendering is consistent
            onclone: (document) => {
                const style = document.createElement('style');
                style.innerHTML = `
                    body { color: black !important; }
                    .text-foreground { color: black !important; }
                    .text-muted-foreground { color: #555 !important; }
                    .dark\\:text-foreground { color: black !important; } /* Override dark mode text colors */
                     .dark\\:text-muted-foreground { color: #555 !important; }
                     .dark\\:bg-slate-900\\/90 { background-color: rgba(255, 255, 255, 0.9) !important; } /* Override dark card bg */
                    .dark\\:border-cyan-700\\/30 { border-color: rgba(34, 211, 238, 0.3) !important; } /* Override dark border */
                 `;
                document.head.appendChild(style);
             }
        })
        .then((canvas) => {
            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF('p', 'mm', 'a4');
            const imgProps = pdf.getImageProperties(imgData);
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
            const pageHeight = pdf.internal.pageSize.getHeight();
            let heightLeft = pdfHeight;
            let position = 0;

            pdf.addImage(imgData, 'PNG', 5, position + 5, pdfWidth - 10, pdfHeight - 10); // Add margins
            heightLeft -= pageHeight;

            while (heightLeft > 0) {
                position = heightLeft - pdfHeight;
                pdf.addPage();
                pdf.addImage(imgData, 'PNG', 5, position + 5, pdfWidth - 10, pdfHeight - 10); // Add margins
                heightLeft -= pageHeight;
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
                description: 'Failed to generate PDF. Please try again.',
                variant: 'destructive',
            });
        })
        .finally(() => {
             // Restore original theme
            if (originalTheme === 'dark') {
                 document.documentElement.classList.add('dark');
            }

             // Restore original colors
            elementsToColor.forEach(el => {
                 const hasBgClass = ['bg-green-200', 'bg-yellow-200', 'bg-red-200', 'bg-gray-200'].some(cls => el.classList.contains(cls));
                 if (!hasBgClass) {
                     const originalColor = originalColors.get(el);
                     if (originalColor !== undefined) {
                         if (el instanceof SVGTextElement || el instanceof SVGTSpanElement) {
                             el.style.fill = originalColor;
                         } else {
                             el.style.color = originalColor;
                         }
                     } else {
                         // If no original color was stored, reset styles
                         if (el instanceof SVGTextElement || el instanceof SVGTSpanElement) {
                             el.style.fill = '';
                         } else {
                             el.style.color = '';
                         }
                     }
                 }
            });
             // Restore accordion states (optional, might be complex)
             // For simplicity, we leave them expanded after PDF generation
        });
    }, 100); // Delay to allow rendering changes
  };


  const parseData = (data: string): SensorData[] => {
    console.log("Parsing data...");
    const lines = data.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    if (lines.length < 2) {
        console.warn("No data rows found after header.");
        return [];
    }
    const header = lines[0].split(',').map(item => item.trim());
    const expectedHeaders = ['Date', 'Location', 'Water_Temperature_C', 'Salinity_PSU', 'pH_Level', 'Dissolved_Oxygen_mg_L', 'Turbidity_NTU', 'Nitrate_mg_L'];

    // Simple header check - more robust checks might be needed
    if (header.length !== expectedHeaders.length || !header.every((h, i) => h === expectedHeaders[i])) {
      // Attempt to find header indices even if order is wrong or names differ slightly
       const indices: {[key: string]: number} = {
           date: header.findIndex(h => /date/i.test(h)),
           location: header.findIndex(h => /location/i.test(h)),
           waterTemperature: header.findIndex(h => /temp/i.test(h)),
           salinity: header.findIndex(h => /salinity/i.test(h)),
           pHLevel: header.findIndex(h => /ph/i.test(h)),
           dissolvedOxygen: header.findIndex(h => /oxygen/i.test(h)),
           turbidity: header.findIndex(h => /turbidity/i.test(h)),
           nitrate: header.findIndex(h => /nitrate/i.test(h)),
       };

       if (Object.values(indices).some(index => index === -1)) {
           console.error("CSV header is missing expected columns or format is incorrect. Expected:", expectedHeaders.join(','));
           toast({
               title: 'CSV Header Error',
               description: `CSV header is missing expected columns or format is incorrect. Expected: ${expectedHeaders.join(',')}`,
               variant: 'destructive',
           });
           return []; // Stop parsing if headers are fundamentally wrong
       }

        console.warn("CSV header doesn't match expected format exactly. Attempting to parse based on found column indices.");

        const parsedEntriesDynamic = lines.slice(1).map((entry, index) => {
          console.log(`Parsing line ${index + 1}: ${entry}`);
          const parts = entry.split(',').map(item => item.trim());
          if (parts.length !== header.length) { // Check against actual header length
            console.warn(`Skipping incomplete or malformed entry (line ${index + 2}): ${entry}`);
            return null;
          }

          const waterTemperatureNum = parseFloat(parts[indices.waterTemperature]);
          const salinityNum = parseFloat(parts[indices.salinity]);
          const pHLevelNum = parseFloat(parts[indices.pHLevel]);
          const dissolvedOxygenNum = parseFloat(parts[indices.dissolvedOxygen]);
          const turbidityNum = parseFloat(parts[indices.turbidity]);
          const nitrateNum = parseFloat(parts[indices.nitrate]);

          if (
            isNaN(waterTemperatureNum) ||
            isNaN(salinityNum) ||
            isNaN(pHLevelNum) ||
            isNaN(dissolvedOxygenNum) ||
            isNaN(turbidityNum) ||
            isNaN(nitrateNum) ||
            indices.date === -1 || // Ensure date and location were found
            indices.location === -1
          ) {
            console.warn(`Skipping entry with invalid numeric values or missing required columns (line ${index + 2}): ${entry}`);
            return null;
          }

          return {
            time: parts[indices.date],
            location: parts[indices.location],
            waterTemperature: waterTemperatureNum,
            salinity: salinityNum,
            pHLevel: pHLevelNum,
            dissolvedOxygen: dissolvedOxygenNum,
            turbidity: turbidityNum,
            nitrate: nitrateNum,
          };
        }).filter((item): item is SensorData => item !== null);
         console.log("Parsing completed with dynamic headers. Parsed entries:", parsedEntriesDynamic);
        return parsedEntriesDynamic;

    } else {
        // Headers match, proceed with direct indexing
        const parsedEntries = lines.slice(1).map((entry, index) => {
          console.log(`Parsing line ${index + 1}: ${entry}`);
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
            isNaN(waterTemperatureNum) ||
            isNaN(salinityNum) ||
            isNaN(pHLevelNum) ||
            isNaN(dissolvedOxygenNum) ||
            isNaN(turbidityNum) ||
            isNaN(nitrateNum)
          ) {
            console.warn(`Skipping entry with invalid numeric values (line ${index + 2}): ${entry}`);
            return null;
          }

          return {
            time: date,
            location: location,
            waterTemperature: waterTemperatureNum,
            salinity: salinityNum,
            pHLevel: pHLevelNum,
            dissolvedOxygen: dissolvedOxygenNum,
            turbidity: turbidityNum,
            nitrate: nitrateNum,
          };
        }).filter((item): item is SensorData => item !== null);
        console.log("Parsing completed with exact headers. Parsed entries:", parsedEntries);
        return parsedEntries;
    }
  };


 const analyzeData = async () => {
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

    setIsLoading(true);
    setAnalysisProgress(0);
    setAnalysisResults([]);
    setStartTime(Date.now());
    setTrainedModelInfo(null); // Clear previous model
    console.log("Set loading state, cleared previous results/model, recorded start time.");
    csvDataRef.current = sensorData;

    let trainingResult: { model: tf.Sequential; normParams: NormalizationParams } | null = null;
    let normParamsToDispose: NormalizationParams | null = null; // Track normParams for disposal

    try {
        console.log("Parsing sensor data...");
        const parsedData = parseData(sensorData);
        console.log("Parsed data:", parsedData);

        if (!parsedData || parsedData.length === 0) {
            console.log("No valid data after parsing.");
            toast({
                title: 'Error',
                description: 'No valid data found or data format is incorrect. Please check your input.',
                variant: 'destructive',
            });
            setIsLoading(false);
            setStartTime(null);
            return;
        }

        // --- Train Model ---
        console.log("Training model using prediction-model.ts...");
        setAnalysisProgress(10);
        trainingResult = await trainPredictionModel(parsedData);
        setTrainedModelInfo(trainingResult); // Save the trained model and norm params
        if (trainingResult) {
            normParamsToDispose = trainingResult.normParams; // Store normParams for later disposal
        }
        console.log("Model training finished. Training result:", trainingResult);
        setAnalysisProgress(30);

        // --- Analyze Data Points ---
        console.log("Analyzing each data point for suitability...");
        let detailedResults: AnalysisResult[] = parsedData.map((data, index) => {
            console.log(`Analyzing data point ${index}:`, data);
            const {isSuitable, summary, threateningFactors} = analyzeSensorData(
                data,
                sensorDataThresholds
            );
            const suitabilityIndex = calculateSuitabilityIndex(data, sensorDataThresholds);
             console.log(`Analysis for point ${index}: Suitable - ${isSuitable}, Index - ${suitabilityIndex}`);

             let improvements: string[] = [];
             if (isSuitable === false) {
                 improvements = Object.entries(threateningFactors)
                     .filter(([_, value]) => value)
                     .map(([key]) => {
                         switch(key) {
                             case 'temperature': return "Address high/low water temperature issues.";
                             case 'salinity': return "Investigate and mitigate salinity fluctuations.";
                             case 'pHLevel': return "Monitor and address pH imbalances (acidification).";
                             case 'dissolvedOxygen': return "Improve water circulation or reduce oxygen consumption sources.";
                             case 'turbidity': return "Reduce sediment runoff or sources of water cloudiness.";
                             case 'nitrate': return "Control nutrient inputs from runoff or pollution.";
                             default: return `Address issues related to ${key}.`;
                         }
                     });
                 if (improvements.length === 0) {
                    // This case might happen if overall isSuitable is false due to multiple cautions,
                    // but no single factor crossed the 'threatening' threshold individually in the simplified check.
                    // Let's add a general note.
                    const cautions = analyzeSensorData(data, sensorDataThresholds).summary.includes('caution factors:');
                    if(cautions) {
                         improvements = ["Multiple parameters are in caution ranges, contributing to overall unsuitability. Review all parameters."];
                    } else {
                         improvements = ["Review all parameters to identify the cause of unsuitability."]; // Fallback
                    }
                 }
            } else if (isSuitable === true) {
                 const cautions = analyzeSensorData(data, sensorDataThresholds).summary.includes('caution factors:');
                 if (cautions) {
                     improvements = ["Environment is suitable, but monitor parameters in caution ranges."];
                 } else {
                     improvements = ["Environment appears ideal, continue monitoring."];
                 }
            } else { // isSuitable is null - should not happen with current logic, but good to handle
                 improvements = ["Analysis inconclusive."];
            }


            const currentProgress = 30 + ((index + 1) / parsedData.length) * 30;
            setAnalysisProgress(currentProgress);
            console.log(`Analysis progress: ${currentProgress.toFixed(0)}%`);

            return {
                ...data,
                isSuitable,
                summary,
                improvements,
                suitabilityIndex,
                isPrediction: false,
            };
        });
        console.log("Finished suitability analysis for all data points.");

        // --- Generate Predictions ---
        if (trainingResult) {
            console.log("Generating predictions using prediction-model.ts...");
            const numPredictions = 5;
            // Pass the model, normParams, and the already analyzed results
            const predictedResults = await generatePredictions(
                trainingResult.model,
                trainingResult.normParams,
                detailedResults, // Pass the current results array for sequential prediction
                numPredictions,
                parsedData // Pass original parsed data for time gap calculation
            );

            // Combine original analyzed results with new predictions
             detailedResults = [...detailedResults, ...predictedResults];

             // Update progress after predictions (assuming predictions take up the remaining 40%)
            setAnalysisProgress(100);
            console.log("Finished predictions.");
        } else {
             console.log("Model training failed or skipped. No predictions will be made.");
             setAnalysisProgress(100);
             toast({
                 title: "Prediction Skipped",
                 description: "Model training failed or was skipped, so predictions could not be made.",
                 variant: "destructive",
             });
        }

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
    } finally {
         // Dispose the normalization parameter tensors AFTER analysis and predictions
         if (normParamsToDispose) {
            tf.dispose([normParamsToDispose.min, normParamsToDispose.max]);
            console.log("Disposed normalization parameter tensors.");
         } else {
             console.warn("Normalization parameters were null or model training failed, cannot dispose.");
         }
        console.log("Analysis process finished. Setting loading state to false.");
        setIsLoading(false);
        setStartTime(null); // Reset start time
        if (analysisProgress < 100 && analysisProgress > 0) { // If stopped early but not at 0
             setAnalysisProgress(0); // Reset progress fully if error occurred before completion
         } else if (analysisProgress === 100) {
             // Keep progress at 100 on success
         }
         // Reset refs for next run
         lastProgressRef.current = 0;
         lastRemainingTimeRef.current = '';
    }
};


  return (
    <div ref={reportRef} className="flex flex-col items-center justify-start min-h-screen py-12 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-blue-300 via-blue-400 to-teal-500 text-foreground">

      {/* Header Section */}
      <header className="w-full max-w-5xl mb-8 text-center text-white shadow-lg p-4 rounded-lg bg-black/30 backdrop-blur-sm">
         <div className="flex items-center justify-center mb-2">
            <Fish className="w-10 h-10 mr-3 text-cyan-300 animate-pulse" />
            <h1 className="text-4xl font-bold">CoralGuard</h1>
          </div>
        <p className="text-lg text-cyan-100">V2.0 - Mariana</p>
        <p className="mt-4 text-sm text-blue-200">
          Made with love by Senath Sethmika
        </p>
        {/* Removed social media links */}
      </header>

      <div className="max-w-7xl w-full space-y-8">
        <Card className="bg-white/90 dark:bg-slate-900/90 text-foreground shadow-xl rounded-xl backdrop-blur-md border border-white/30">
           <CardHeader>
             <div className="flex items-center mb-4">
               <Avatar>
                 <AvatarImage data-ai-hint="coral reef" src="https://picsum.photos/seed/coralreef/50/50" alt="CoralSafe Logo" className="border-2 border-cyan-300 rounded-full" />
                 <AvatarFallback className="bg-cyan-500 text-white">CS</AvatarFallback>
               </Avatar>
                {/* Corrected placement of the title text */}
                <CardTitle className="ml-4 text-2xl font-semibold text-foreground">CoralSafe: Sensor Data Analyzer</CardTitle>
             </div>

            {/* CardDescription now correctly contains divs instead of nested p tags */}
            <CardDescription className="text-muted-foreground text-sm">
                <div className="font-medium mb-1 text-foreground">Paste your CSV sensor data below.</div>
                <div className="text-foreground">Expected Format: <code className="bg-black/20 px-1 py-0.5 rounded text-xs">Date,Location,Water_Temperature_C,Salinity_PSU,pH_Level,Dissolved_Oxygen_mg_L,Turbidity_NTU,Nitrate_mg_L</code></div>
            </CardDescription>
          </CardHeader>
          <CardContent>
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
              disabled={isLoading || !sensorData.trim()}
              className="mt-4 w-full bg-cyan-500 text-white hover:bg-cyan-600 disabled:opacity-50 transition-all duration-300 transform hover:scale-105 shadow-md text-lg font-semibold py-3 rounded-lg"
            >
              <Activity className="w-5 h-5 mr-2"/> {isLoading ? 'Analyzing...' : 'Analyze Data'}
            </Button>
             {isLoading && (
                 <div className="w-full px-4 mt-4">
                     <Progress value={analysisProgress} className="w-full [&>div]:bg-cyan-400 h-2.5 rounded-full bg-white/30" />
                     <p className="text-center text-sm text-foreground mt-2">
                        Analysis Progress: {analysisProgress.toFixed(0)}% {remainingTimeText && `(${remainingTimeText})`}
                     </p>
                 </div>
             )}
          </CardContent>
        </Card>


      {/* Analysis Results Table */}
      {analysisResults.length > 0 && (
          <Card className="bg-white/90 dark:bg-slate-900/90 text-foreground shadow-xl rounded-xl backdrop-blur-md border border-white/30 overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xl font-semibold text-foreground">Analysis Results</CardTitle>
                 <Button
                    onClick={downloadReport} // Simplified download, no popup
                    className="bg-cyan-500 text-white hover:bg-cyan-600 transition-colors duration-300 shadow-sm"
                    size="sm"
                 >
                    <Gauge className="w-4 h-4 mr-2"/> Download Report (PDF)
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
                      const isPrediction = result.isSuitable === null;
                      let suitabilityClass = '';
                      let suitabilityText = '';
                      let suitabilityIndexText = result.suitabilityIndex !== undefined ? `(${result.suitabilityIndex.toFixed(0)})` : '';


                      if (isPrediction) {
                          suitabilityClass = 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-300';
                          suitabilityText = 'Prediction';
                          suitabilityIndexText = '';
                      } else {
                           // isSuitable being false means at least one factor crossed the 'threatening' threshold.
                           const isThreatening = result.isSuitable === false;
                           // Check for cautions even if not threatening overall
                           const hasCautions = !isThreatening && analyzeSensorData(result, sensorDataThresholds).summary.includes('caution factors:');
                           const isIdeal = !isThreatening && !hasCautions;


                           if (isIdeal) {
                               suitabilityClass = 'bg-green-200 dark:bg-green-800/50 text-green-800 dark:text-green-200';
                               suitabilityText = 'Suitable';
                           } else if (hasCautions) {
                               suitabilityClass = 'bg-yellow-200 dark:bg-yellow-800/50 text-yellow-800 dark:text-yellow-200';
                               suitabilityText = 'Warning';
                           } else { // Must be threatening
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
                                           <li>No specific actions suggested.</li>
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
                {parameters.map((parameter) => (
                     <AccordionItem value={parameter.key} key={parameter.key} className="border-none">
                        <Card className="bg-white/90 dark:bg-slate-900/90 text-foreground shadow-xl rounded-xl backdrop-blur-md border border-white/30 overflow-hidden">
                            <AccordionTrigger className="text-lg font-medium p-4 hover:no-underline hover:bg-cyan-500/10 dark:hover:bg-cyan-400/10 transition-colors duration-150 rounded-t-xl w-full flex items-center justify-between text-foreground">
                                <div className="flex items-center">
                                    <parameter.icon className="w-5 h-5 mr-2 text-cyan-500"/>
                                    {parameter.name} Trends
                                </div>
                            </AccordionTrigger>
                             <AccordionContent className="p-4 border-t border-cyan-200/30 dark:border-cyan-700/30">
                                <p className="text-sm text-muted-foreground mb-4 text-foreground">
                                    Visualizing {parameter.name} ({parameter.unit}) over time, including predicted values.
                                </p>
                                <ChartContainer config={chartConfig} className="aspect-video h-[300px] w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <LineChart
                                          data={analysisResults}
                                          margin={{ top: 5, right: 30, left: 0, bottom: 5 }}
                                        >
                                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.5)" />
                                          <XAxis dataKey="time" stroke="hsl(var(--foreground))" tick={{fontSize: 12, fill: 'hsl(var(--foreground))'}} axisLine={false} tickLine={false} padding={{left: 10, right: 10}}/>
                                          <YAxis stroke="hsl(var(--foreground))" tick={{fontSize: 12, fill: 'hsl(var(--foreground))'}} axisLine={false} tickLine={false} domain={['auto', 'auto']} />
                                           <RechartsTooltip
                                                content={
                                                    <ChartTooltipContent
                                                        indicator="dot"
                                                        labelClassName="text-sm font-medium text-foreground"
                                                        className="rounded-lg border border-border/50 bg-background/90 p-2 shadow-lg backdrop-blur-sm text-foreground"
                                                    />
                                                }
                                                 cursor={{ stroke: "hsl(var(--accent))", strokeWidth: 1, strokeDasharray: "3 3"}}
                                            />
                                          <RechartsLegend content={ <ChartLegendContent
                                              nameKey={parameter.key}
                                              payload={
                                                Object.entries(chartConfig)
                                                  .filter(([key]) => key === parameter.key || key === 'prediction')
                                                  .map(([key, config]) => ({
                                                    value: config.label,
                                                    type: key === 'prediction' ? 'dashed' : 'line',
                                                    id: key,
                                                    color: key === 'prediction' ? config.color : chartConfig[parameter.key]?.color,
                                                    icon: config.icon
                                                  }))
                                              }
                                              className="text-foreground"
                                          /> }
                                          />
                                          {/* Actual Data Line */}
                                          <Line
                                            key={`${parameter.key}-actual`}
                                            dataKey={(payload: AnalysisResult) => payload.isPrediction ? null : payload[parameter.key as keyof AnalysisResult]}
                                            type="linear"
                                            stroke={chartConfig[parameter.key]?.color || '#8884d8'} // Use the parameter's color
                                            strokeWidth={2}
                                            dot={{ fill: chartConfig[parameter.key]?.color || '#8884d8', r: 3 }}
                                            activeDot={{ r: 6, strokeWidth: 2, fill: chartConfig[parameter.key]?.color || '#8884d8' }}
                                            name={parameter.name}
                                            isAnimationActive={false}
                                            connectNulls={false} // Don't connect gaps where actual data might be missing
                                          />
                                          {/* Prediction Line - Connects last actual point to first prediction */}
                                           <Line
                                                key={`${parameter.key}-prediction`}
                                                dataKey={(payload: AnalysisResult, index: number) => {
                                                     // Find the index of the first prediction
                                                    const firstPredictionIndex = analysisResults.findIndex(d => d.isPrediction === true);
                                                    // Include the point if it's a prediction OR if it's the very last actual data point before predictions start
                                                    if (payload.isPrediction || (firstPredictionIndex !== -1 && index === firstPredictionIndex -1)) {
                                                        // Return the value for the current parameter
                                                        return payload[parameter.key as keyof AnalysisResult];
                                                    }
                                                    return null; // Return null for other actual data points
                                                }}
                                                stroke={chartConfig[parameter.key]?.color || '#8884d8'} // Use parameter color
                                                type="linear"
                                                strokeWidth={2}
                                                strokeDasharray="5 5" // Dashed line for prediction
                                                dot={{ fill: chartConfig[parameter.key]?.color || '#8884d8', r: 3 }} // Match dot color
                                                activeDot={false} // No active dot for prediction line itself
                                                name={`${parameter.name} (Pred.)`}
                                                isAnimationActive={false}
                                                connectNulls={true} // Connect the last actual point to the first prediction
                                             />

                                        </LineChart>
                                    </ResponsiveContainer>
                                </ChartContainer>
                             </AccordionContent>
                         </Card>
                    </AccordionItem>
                ))}
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

      </div>

       {/* Footer Section */}
      <footer className="w-full max-w-5xl mt-12 text-center text-white/70 text-xs p-4">
        <p>&copy; {new Date().getFullYear()} CoralGuard by Senath Sethmika. All rights reserved.</p>
        <p>Data analysis for educational and informational purposes only.</p>
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



    