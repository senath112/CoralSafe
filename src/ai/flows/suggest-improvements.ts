'use server';
/**
 * @fileOverview Provides suggestions on how to improve the marine environment for coral growth.
 *
 * - suggestImprovements - A function that suggests improvements based on sensor data.
 * - SuggestImprovementsInput - The input type for the suggestImprovements function.
 * - SuggestImprovementsOutput - The return type for the suggestImprovements function.
 */

import {ai} from '@/ai/ai-instance';
import {z} from 'genkit';

const SuggestImprovementsInputSchema = z.object({
  sensorData: z
    .string()
    .describe(
      'Sensor data from the marine environment, including parameters like temperature, pH, salinity, and oxygen levels. Should be in a standard format like CSV.'
    ),
  threateningFactors: z
    .string()
    .describe(
      'A summary of the factors that make the environment threatening to coral growth, based on the sensor data analysis.'
    ),
});
export type SuggestImprovementsInput = z.infer<typeof SuggestImprovementsInputSchema>;

const SuggestImprovementsOutputSchema = z.object({
  suggestedActions: z
    .string()
    .describe(
      'A list of specific actions that can be taken to improve the environment for coral growth, addressing the identified threatening factors.'
    ),
});
export type SuggestImprovementsOutput = z.infer<typeof SuggestImprovementsOutputSchema>;

export async function suggestImprovements(input: SuggestImprovementsInput): Promise<SuggestImprovementsOutput> {
  return suggestImprovementsFlow(input);
}

const prompt = ai.definePrompt({
  name: 'suggestImprovementsPrompt',
  input: {
    schema: z.object({
      sensorData: z
        .string()
        .describe(
          'Sensor data from the marine environment, including parameters like temperature, pH, salinity, and oxygen levels. Should be in a standard format like CSV.'
        ),
      threateningFactors: z
        .string()
        .describe(
          'A summary of the factors that make the environment threatening to coral growth, based on the sensor data analysis.'
        ),
    }),
  },
  output: {
    schema: z.object({
      suggestedActions: z
        .string()
        .describe(
          'A list of specific actions that can be taken to improve the environment for coral growth, addressing the identified threatening factors.'
        ),
    }),
  },
  prompt: `Based on the sensor data and identified threatening factors, suggest specific actions to improve the environment for coral growth.\n\nSensor Data: {{{sensorData}}}\nThreatening Factors: {{{threateningFactors}}}\n\nSuggested Actions:`,
});

const suggestImprovementsFlow = ai.defineFlow<
  typeof SuggestImprovementsInputSchema,
  typeof SuggestImprovementsOutputSchema
>({
  name: 'suggestImprovementsFlow',
  inputSchema: SuggestImprovementsInputSchema,
  outputSchema: SuggestImprovementsOutputSchema,
}, async input => {
  const {output} = await prompt(input);
  return output!;
});
