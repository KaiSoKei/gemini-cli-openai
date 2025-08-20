import { Transform } from 'stream';
import { StreamChunk, ReasoningData, GeminiFunctionCall, UsageData } from "./types";
import { NativeToolResponse } from "./types/native-tools";
import { OPENAI_CHAT_COMPLETION_OBJECT } from "./config";

// OpenAI API interfaces
interface OpenAIToolCall {
	index: number;
	id: string;
	type: "function";
	function: {
		name: string;
		arguments: string;
	};
}

interface OpenAIChoice {
	index: number;
	delta: OpenAIDelta;
	finish_reason: string | null;
	logprobs?: null;
	matched_stop?: null;
}

interface OpenAIDelta {
	role?: string;
	content?: string | null;
	reasoning?: string;
	reasoning_content?: string | null;
	tool_calls?: OpenAIToolCall[];
	native_tool_calls?: NativeToolResponse[];
	grounding?: unknown;
}

interface OpenAIChunk {
	id: string;
	object: string;
	created: number;
	model: string;
	choices: OpenAIChoice[];
	usage?: null;
}

interface OpenAIFinalChoice {
	index: number;
	delta: Record<string, never>;
	finish_reason: string;
}

interface OpenAIUsage {
	prompt_tokens: number;
	completion_tokens: number;
	total_tokens: number;
}

interface OpenAIFinalChunk {
	id: string;
	object: string;
	created: number;
	model: string;
	choices: OpenAIFinalChoice[];
	usage?: OpenAIUsage;
}

// Type guard functions
function isReasoningData(data: unknown): data is ReasoningData {
	return typeof data === "object" && data !== null && ("reasoning" in data || "toolCode" in data);
}

function isGeminiFunctionCall(data: unknown): data is GeminiFunctionCall {
	return typeof data === "object" && data !== null && "name" in data && "args" in data;
}

function isUsageData(data: unknown): data is UsageData {
	return typeof data === "object" && data !== null && "inputTokens" in data && "outputTokens" in data;
}
function isNativeToolResponse(data: unknown): data is NativeToolResponse {
	return typeof data === "object" && data !== null && "type" in data && "data" in data;
}

/**
 * Creates a TransformStream to convert Gemini's output chunks
 * into OpenAI-compatible server-sent events.
 */
export function createOpenAIStreamTransformer(model: string): Transform {
	const chatID = `chatcmpl-${crypto.randomUUID()}`;
	const creationTime = Math.floor(Date.now() / 1000);
	let firstChunk = true;
	let toolCallId: string | null = null;
	let toolCallName: string | null = null;
	let usageData: UsageData | undefined;

	return new Transform({
        objectMode: true,
		transform(chunk, encoding, callback) {
            const chunkString = chunk.toString();
            const chunkObject = JSON.parse(chunkString) as StreamChunk;
			const delta: OpenAIDelta = {};
			let openAIChunk: OpenAIChunk | null = null;

			switch (chunkObject.type) {
				case "text":
				case "thinking_content":
					if (typeof chunkObject.data === "string") {
						delta.content = chunkObject.data;
						if (firstChunk) {
							delta.role = "assistant";
							firstChunk = false;
						}
					}
					break;
				case "real_thinking":
					if (typeof chunkObject.data === "string") {
						delta.reasoning = chunkObject.data;
					}
					break;
				case "reasoning":
					if (isReasoningData(chunkObject.data)) {
						delta.reasoning = chunkObject.data.reasoning;
					}
					break;
				case "tool_code":
					if (isGeminiFunctionCall(chunkObject.data)) {
						const toolData = chunkObject.data;
						toolCallName = toolData.name;
						toolCallId = `call_${crypto.randomUUID()}`;
						delta.tool_calls = [
							{
								index: 0,
								id: toolCallId,
								type: "function",
								function: {
									name: toolCallName,
									arguments: JSON.stringify(toolData.args)
								}
							}
						];
						if (firstChunk) {
							delta.role = "assistant";
							delta.content = null;
							firstChunk = false;
						}
					}
					break;
				case "native_tool":
					if (isNativeToolResponse(chunkObject.data)) {
						delta.native_tool_calls = [chunkObject.data];
					}
					break;
				case "grounding_metadata":
					if (chunkObject.data) {
						delta.grounding = chunkObject.data;
					}
					break;
				case "usage":
					if (isUsageData(chunkObject.data)) {
						usageData = chunkObject.data;
					}
					return; // Don't send a chunk for usage data
			}

			if (Object.keys(delta).length > 0) {
				openAIChunk = {
					id: chatID,
					object: OPENAI_CHAT_COMPLETION_OBJECT,
					created: creationTime,
					model: model,
					choices: [
						{
							index: 0,
							delta: delta,
							finish_reason: null,
							logprobs: null,
							matched_stop: null
						}
					],
					usage: null
				};
				this.push(`data: ${JSON.stringify(openAIChunk)}\n\n`);
			}
            callback();
		},
		flush(callback) {
			const finishReason = toolCallId ? "tool_calls" : "stop";
			const finalChunk: OpenAIFinalChunk = {
				id: chatID,
				object: OPENAI_CHAT_COMPLETION_OBJECT,
				created: creationTime,
				model: model,
				choices: [{ index: 0, delta: {}, finish_reason: finishReason }]
			};

			if (usageData) {
				finalChunk.usage = {
					prompt_tokens: usageData.inputTokens,
					completion_tokens: usageData.outputTokens,
				total_tokens: usageData.inputTokens + usageData.outputTokens
				};
			}

			this.push(`data: ${JSON.stringify(finalChunk)}\n\n`);
			this.push("data: [DONE]\n\n");
            callback();
		}
	});
}