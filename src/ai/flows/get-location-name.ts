'use server';
/**
 * @fileOverview Retrieves a location name from geographical coordinates.
 *
 * - getLocationName - A function that gets the location name based on latitude and longitude.
 * - GetLocationNameInput - The input type for the getLocationName function.
 * - GetLocationNameOutput - The return type for the getLocationName function.
 */

import {ai} from '@/ai/ai-instance';
import {z} from 'genkit';

const GetLocationNameInputSchema = z.object({
  latitude: z.number().describe('The latitude of the location.'),
  longitude: z.number().describe('The longitude of the location.'),
});
export type GetLocationNameInput = z.infer<typeof GetLocationNameInputSchema>;

const GetLocationNameOutputSchema = z.object({
  locationName: z.string().describe('The common name of the location (e.g., city, region, country, specific reef name if known).'),
});
export type GetLocationNameOutput = z.infer<typeof GetLocationNameOutputSchema>;

export async function getLocationName(input: GetLocationNameInput): Promise<GetLocationNameOutput> {
  return getLocationNameFlow(input);
}

const prompt = ai.definePrompt({
  name: 'getLocationNamePrompt',
  input: {
    schema: GetLocationNameInputSchema,
  },
  output: {
    schema: GetLocationNameOutputSchema,
  },
  prompt: `Based on the following geographical coordinates, provide the most specific and commonly known location name (e.g., city, region, country, or specific reef name if identifiable). If it's in the ocean far from land, state the ocean or sea name.

Latitude: {{{latitude}}}
Longitude: {{{longitude}}}

Provide only the location name in the 'locationName' field.`,
});

const getLocationNameFlow = ai.defineFlow<
  typeof GetLocationNameInputSchema,
  typeof GetLocationNameOutputSchema
>(
  {
    name: 'getLocationNameFlow',
    inputSchema: GetLocationNameInputSchema,
    outputSchema: GetLocationNameOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    // Ensure the output is not null before returning
    if (!output) {
      throw new Error("Failed to get location name. The prompt returned null.");
    }
    return output;
  }
);
