import { Router } from 'express';
import { Env } from '../types';
import { AuthManager } from '../auth';
import { GeminiApiClient } from '../gemini-client';

/**
 * Debug and testing routes for troubleshooting authentication and API functionality.
 */
export const DebugRoute = Router();

// Check KV cache status
DebugRoute.get("/cache", async (req, res) => {
	try {
        const env = (req as any).env as Env;
		const authManager = new AuthManager(env);
		const cacheInfo = await authManager.getCachedTokenInfo();

		// Remove sensitive information from the response
		const sanitizedInfo = {
			status: "ok",
			cached: cacheInfo.cached,
			cached_at: cacheInfo.cached_at,
			expires_at: cacheInfo.expires_at,
			time_until_expiry_seconds: cacheInfo.time_until_expiry_seconds,
			is_expired: cacheInfo.is_expired,
			message: cacheInfo.message
			// Explicitly exclude token_preview and any other sensitive data
		};

		return res.json(sanitizedInfo);
	} catch (e: unknown) {
		const errorMessage = e instanceof Error ? e.message : String(e);
		return res.status(500).json(
			{
				status: "error",
				message: errorMessage
			}
		);
	}
});

// Simple token test endpoint
DebugRoute.post("/token-test", async (req, res) => {
	try {
		console.log("Token test endpoint called");
        const env = (req as any).env as Env;
		const authManager = new AuthManager(env);

		// Test authentication only
		await authManager.initializeAuth();
		console.log("Token test passed");

		return res.json({
			status: "ok",
			message: "Token authentication successful"
		});
	} catch (e: unknown) {
		const errorMessage = e instanceof Error ? e.message : String(e);
		console.error("Token test error:", e);
		return res.status(500).json(
			{
				status: "error",
				message: errorMessage
				// Removed stack trace for security
			}
		);
	}
});

// Full functionality test endpoint
DebugRoute.post("/test", async (req, res) => {
	try {
		console.log("Test endpoint called");
        const env = (req as any).env as Env;
		const authManager = new AuthManager(env);
		const geminiClient = new GeminiApiClient(env, authManager);

		// Test authentication
		await authManager.initializeAuth();
		console.log("Auth test passed");

		// Test project discovery
		const projectId = await geminiClient.discoverProjectId();
		console.log("Project discovery test passed");

		return res.json({
			status: "ok",
			message: "Authentication and project discovery successful",
			project_available: !!projectId
			// Removed actual projectId for security
		});
	} catch (e: unknown) {
		const errorMessage = e instanceof Error ? e.message : String(e);
		console.error("Test endpoint error:", e);
		return res.status(500).json(
			{
				status: "error",
				message: errorMessage
				// Removed stack trace and detailed error message for security
			}
		);
	}
});