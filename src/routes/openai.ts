import { Router } from 'express';
import { Env, ChatCompletionRequest, ChatCompletionResponse } from '../types';
import { geminiCliModels, DEFAULT_MODEL, getAllModelIds } from '../models';
import { OPENAI_MODEL_OWNER } from '../config';
import { DEFAULT_THINKING_BUDGET } from '../constants';
import { AuthManager } from '../auth';
import { GeminiApiClient } from '../gemini-client';
import { createOpenAIStreamTransformer } from '../stream-transformer';
import { pipeline } from 'stream/promises';

/**
 * OpenAI-compatible API routes for models and chat completions.
 */
export const OpenAIRoute = Router();

// List available models
OpenAIRoute.get("/models", async (req, res) => {
	const modelData = getAllModelIds().map((modelId) => ({
		id: modelId,
		object: "model",
		created: Math.floor(Date.now() / 1000),
		owned_by: OPENAI_MODEL_OWNER
	}));

	return res.json({
		object: "list",
		data: modelData
	});
});

// Chat completions endpoint
OpenAIRoute.post("/chat/completions", async (req, res) => {
	try {
		console.log("Chat completions request received");
		const body = req.body as ChatCompletionRequest;
        const env = (req as any).env as Env;
		const model = body.model || DEFAULT_MODEL;
		const messages = body.messages || [];
		// OpenAI API compatibility: stream defaults to true unless explicitly set to false
		const stream = body.stream !== false;

		// Check environment settings for real thinking
		const isRealThinkingEnabled = env.ENABLE_REAL_THINKING === "true";
		let includeReasoning = isRealThinkingEnabled; // Automatically enable reasoning when real thinking is enabled
		let thinkingBudget = body.thinking_budget ?? DEFAULT_THINKING_BUDGET; // Default to dynamic allocation

		// Newly added parameters
		const generationOptions = {
			max_tokens: body.max_tokens,
			temperature: body.temperature,
			top_p: body.top_p,
			stop: body.stop,
			presence_penalty: body.presence_penalty,
			frequency_penalty: body.frequency_penalty,
			seed: body.seed,
			response_format: body.response_format
		};

		// Handle effort level mapping to thinking_budget (check multiple locations for client compatibility)
		const reasoning_effort =
			body.reasoning_effort || body.extra_body?.reasoning_effort || body.model_params?.reasoning_effort;
		if (reasoning_effort) {
			includeReasoning = true; // Effort implies reasoning
			const isFlashModel = model.includes("flash");
			switch (reasoning_effort) {
				case "low":
					thinkingBudget = 1024;
					break;
				case "medium":
					thinkingBudget = isFlashModel ? 12288 : 16384;
					break;
				case "high":
					thinkingBudget = isFlashModel ? 24576 : 32768;
					break;
				case "none":
					thinkingBudget = 0;
					includeReasoning = false;
					break;
			}
		}

		const tools = body.tools;
		const tool_choice = body.tool_choice;

		console.log("Request body parsed:", {
			model,
			messageCount: messages.length,
			stream,
			includeReasoning,
			thinkingBudget,
			tools,
			tool_choice
		});

		if (!messages.length) {
			return res.status(400).json({ error: "messages is a required field" });
		}

		// Validate model
		if (!(model in geminiCliModels)) {
			return res.status(400).json(
				{
					error: `Model '${model}' not found. Available models: ${getAllModelIds().join(", ")}`
				}
			);
		}

		// Check if the request contains images and validate model support
		const hasImages = messages.some((msg) => {
			if (Array.isArray(msg.content)) {
				return msg.content.some((content) => content.type === "image_url");
			}
			return false;
		});

		if (hasImages && !geminiCliModels[model].supportsImages) {
			return res.status(400).json(
				{
					error: `Model '${model}' does not support image inputs. Please use a vision-capable model like gemini-2.5-pro or gemini-2.5-flash.`
				}
			);
		}

		// Extract system prompt and user/assistant messages
		let systemPrompt = "";
		const otherMessages = messages.filter((msg) => {
			if (msg.role === "system") {
				// Handle system messages with both string and array content
				if (typeof msg.content === "string") {
					systemPrompt = msg.content;
				} else if (Array.isArray(msg.content)) {
					// For system messages, only extract text content
					const textContent = msg.content
						.filter((part) => part.type === "text")
						.map((part) => part.text || "")
						.join(" ");
					systemPrompt = textContent;
				}
				return false;
			}
			return true;
		});

		// Initialize services
		const authManager = new AuthManager(env);
		const geminiClient = new GeminiApiClient(env, authManager);

		// Test authentication first
		try {
			await authManager.initializeAuth();
			console.log("Authentication successful");
		} catch (authError: unknown) {
			const errorMessage = authError instanceof Error ? authError.message : String(authError);
			console.error("Authentication failed:", errorMessage);
			return res.status(401).json({ error: "Authentication failed: " + errorMessage });
		}

		if (stream) {
			// Streaming response
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.flushHeaders();

			try {
				console.log("Starting stream generation");
				const geminiStream = geminiClient.streamContent(model, systemPrompt, otherMessages, {
					includeReasoning,
					thinkingBudget,
					tools,
					tool_choice,
					...generationOptions
				});

                const transformer = createOpenAIStreamTransformer(model);

                await pipeline(geminiStream, transformer, res);

				console.log("Stream completed successfully");
			} catch (streamError: unknown) {
				const errorMessage = streamError instanceof Error ? streamError.message : String(streamError);
				console.error("Stream error:", errorMessage);
				// Try to write an error chunk before closing
				res.write(`data: ${JSON.stringify({error: errorMessage})}\n\n`);
                res.end();
			}
		} else {
			// Non-streaming response
			try {
				console.log("Starting non-streaming completion");
				const completion = await geminiClient.getCompletion(model, systemPrompt, otherMessages, {
					includeReasoning,
					thinkingBudget,
					tools,
					tool_choice,
					...generationOptions
				});

				const response: ChatCompletionResponse = {
					id: `chatcmpl-${crypto.randomUUID()}`,
					object: "chat.completion",
					created: Math.floor(Date.now() / 1000),
					model: model,
					choices: [
						{
							index: 0,
							message: {
								role: "assistant",
								content: completion.content,
								tool_calls: completion.tool_calls
							},
							finish_reason: completion.tool_calls && completion.tool_calls.length > 0 ? "tool_calls" : "stop"
						}
					]
				};

				// Add usage information if available
				if (completion.usage) {
					response.usage = {
						prompt_tokens: completion.usage.inputTokens,
						completion_tokens: completion.usage.outputTokens,
						total_tokens: completion.usage.inputTokens + completion.usage.outputTokens
					};
				}

				console.log("Non-streaming completion successful");
				return res.json(response);
			} catch (completionError: unknown) {
				const errorMessage = completionError instanceof Error ? completionError.message : String(completionError);
				console.error("Completion error:", errorMessage);
				return res.status(500).json({ error: errorMessage });
			}
		}
	} catch (e: unknown) {
		const errorMessage = e instanceof Error ? e.message : String(e);
		console.error("Top-level error:", e);
		return res.status(500).json({ error: errorMessage });
	}
});


// Add a simple health check endpoint
OpenAIRoute.get("/health", (req, res) => {
	return res.json({ status: "ok", timestamp: new Date().toISOString() });
});