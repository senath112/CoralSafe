'use server';
/**
 * @fileOverview Summarizes sensor data to assess coral suitability.
 *
 * - generateDataSummary - A function that summarizes sensor data.
 * - GenerateDataSummaryInput - The input type for the generateDataSummary function.
 * - GenerateDataSummaryOutput - The return type for the generateDataSummary function.
 */

import {ai} from '@/ai/ai-instance';
import {z} from 'genkit';

const GenerateDataSummaryInputSchema = z.object({
  sensorData: z
    .string()
    .describe('The sensor data from the marine environment, such as water temperature, salinity, and pH level.'),
});
export type GenerateDataSummaryInput = z.infer<typeof GenerateDataSummaryInputSchema>;

const GenerateDataSummaryOutputSchema = z.object({
  summary: z.string().describe('A summary of the sensor data and its implications for coral suitability.'),
});
export type GenerateDataSummaryOutput = z.infer<typeof GenerateDataSummaryOutputSchema>;

export async function generateDataSummary(input: GenerateDataSummaryInput): Promise<GenerateDataSummaryOutput> {
  return generateDataSummaryFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateDataSummaryPrompt',
  input: {
    schema: z.object({
      sensorData: z
        .string()
        .describe('The sensor data from the marine environment, such as water temperature, salinity, and pH level.'),
    }),
  },
  output: {
    schema: z.object({
      summary: z.string().describe('A summary of the sensor data and its implications for coral suitability.'),
    }),
  },
  prompt: `You are an expert marine biologist specializing in coral health.

You will receive sensor data from a marine environment. Provide a concise summary of the data, highlighting the key parameters (e.g., temperature, salinity, pH) and their implications for coral suitability. Explain whether the data suggests a suitable or threatening environment for coral.

Sensor Data: {{{sensorData}}}`,
});

const generateDataSummaryFlow = ai.defineFlow<
  typeof GenerateDataSummaryInputSchema,
  typeof GenerateDataSummaryOutputSchema
>(
  {
    name: 'generateDataSummaryFlow',
    inputSchema: GenerateDataSummaryInputSchema,
    outputSchema: GenerateDataSummaryOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
