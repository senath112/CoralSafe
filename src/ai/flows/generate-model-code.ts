'use server';
/**
 * @fileOverview Generates Python code for a hosted TensorFlow/Numpy prediction model.
 *
 * - generateModelCode - A function that generates Python code based on requirements.
 * - GenerateModelCodeInput - The input type for the generateModelCode function.
 * - GenerateModelCodeOutput - The return type for the generateModelCode function.
 */

import {ai} from '@/ai/ai-instance';
import {z} from 'genkit';

const GenerateModelCodeInputSchema = z.object({
  requirements: z
    .string()
    .describe(
      'Detailed requirements for the prediction model code, including features, prediction logic (e.g., sequential), desired libraries (TensorFlow/Keras, Numpy), and hosting preference (e.g., Flask function).'
    ),
  existingDataExample: z.string().optional().describe('An example row or structure of the input data.'),
});
export type GenerateModelCodeInput = z.infer<typeof GenerateModelCodeInputSchema>;

const GenerateModelCodeOutputSchema = z.object({
  pythonCode: z
    .string()
    .describe(
      'The generated Python code for the TensorFlow/Keras model using Numpy, potentially wrapped in a simple hosting function (e.g., Flask).'
    ),
});
export type GenerateModelCodeOutput = z.infer<typeof GenerateModelCodeOutputSchema>;

export async function generateModelCode(input: GenerateModelCodeInput): Promise<GenerateModelCodeOutput> {
  return generateModelCodeFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateModelCodePrompt',
  input: {
    schema: GenerateModelCodeInputSchema,
  },
  output: {
    schema: GenerateModelCodeOutputSchema,
  },
  prompt: `You are an expert AI/ML engineer specializing in time-series prediction using Python, TensorFlow/Keras, and Numpy.

Generate Python code for a machine learning model based on the following requirements:
{{{requirements}}}

{{#if existingDataExample}}
Here is an example structure of the input data:
{{{existingDataExample}}}
{{/if}}

The generated code should:
1.  Use TensorFlow/Keras for the model definition and training.
2.  Use Numpy for data handling and preprocessing if necessary.
3.  Include a clear function for making predictions.
4.  If sequential prediction is mentioned, ensure the prediction function can take the output of the previous step as input for the next step.
5.  Include necessary imports.
6.  (Optional, if requested) Wrap the prediction logic in a simple web server function using Flask or FastAPI for hosting.
7.  Be well-commented and follow Python best practices.

Generate only the Python code. Do not include explanations before or after the code block.
`,
});

const generateModelCodeFlow = ai.defineFlow<
  typeof GenerateModelCodeInputSchema,
  typeof GenerateModelCodeOutputSchema
>(
  {
    name: 'generateModelCodeFlow',
    inputSchema: GenerateModelCodeInputSchema,
    outputSchema: GenerateModelCodeOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    // Ensure the output is not null before returning
    if (!output) {
      throw new Error("Failed to generate model code. The prompt returned null.");
    }
    return output;
  }
);
