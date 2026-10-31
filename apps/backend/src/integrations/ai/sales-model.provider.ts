import { z } from "zod";
import { env } from "../../config/env.js";
import { AppError } from "../../core/errors/AppError.js";
import {
  agentOutputSchema,
  type AgentOutput,
} from "../../modules/sales/sales-agent.schemas.js";
export interface SalesModelRequest {
  instructions: string;
  context: unknown;
  objective: string;
  maxOutputTokens: number;
  signal: AbortSignal;
}
export interface SalesModelResult {
  output: AgentOutput;
  requestId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}
export interface SalesModelProvider {
  configured(): boolean;
  generate(input: SalesModelRequest): Promise<SalesModelResult>;
}
const responseSchema = z
  .object({
    id: z.string(),
    model: z.string(),
    status: z.literal("completed"),
    output: z.array(
      z
        .object({
          type: z.string(),
          content: z
            .array(
              z
                .object({ type: z.string(), text: z.string().optional() })
                .passthrough(),
            )
            .optional(),
        })
        .passthrough(),
    ),
    usage: z.object({
      input_tokens: z.number().int().nonnegative(),
      output_tokens: z.number().int().nonnegative(),
    }),
  })
  .passthrough();
export class OpenAiSalesModel implements SalesModelProvider {
  configured() {
    return !!(env.SALES_AI_API_KEY && env.SALES_AI_MODEL);
  }
  async generate(input: SalesModelRequest): Promise<SalesModelResult> {
    if (!this.configured())
      throw new AppError(
        503,
        "AI_NOT_CONFIGURED",
        "Configure a server-side model and API credential",
      );
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal: input.signal,
      redirect: "error",
      headers: {
        authorization: `Bearer ${env.SALES_AI_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: env.SALES_AI_MODEL,
        store: false,
        instructions: input.instructions,
        input: [
          {
            role: "user",
            content: JSON.stringify({
              objective: input.objective,
              untrustedCustomerData: input.context,
            }),
          },
        ],
        max_output_tokens: input.maxOutputTokens,
        text: {
          format: {
            type: "json_schema",
            name: "sales_proposal",
            strict: true,
            schema: z.toJSONSchema(agentOutputSchema),
          },
        },
      }),
    });
    if (!response.ok)
      throw new AppError(
        503,
        "AI_PROVIDER_FAILED",
        "Model provider rejected the request",
      );
    const data = responseSchema.parse(await response.json());
    const text = data.output
      .flatMap((item) => (item.type === "message" ? (item.content ?? []) : []))
      .filter((c) => c.type === "output_text")
      .map((c) => c.text ?? "")
      .join("");
    let output: AgentOutput;
    try {
      output = agentOutputSchema.parse(JSON.parse(text));
    } catch {
      throw new AppError(
        502,
        "AI_OUTPUT_INVALID",
        "Model response did not satisfy the approved output schema",
      );
    }
    return {
      output,
      requestId: data.id,
      model: data.model,
      inputTokens: data.usage.input_tokens,
      outputTokens: data.usage.output_tokens,
    };
  }
}
let testProvider: SalesModelProvider | undefined;
export function setSalesModelTestProvider(provider?: SalesModelProvider) {
  if (env.NODE_ENV !== "test") throw new Error("TEST_PROVIDER_FORBIDDEN");
  testProvider = provider;
}
export const salesModelProvider = (): SalesModelProvider =>
  testProvider ?? new OpenAiSalesModel();
