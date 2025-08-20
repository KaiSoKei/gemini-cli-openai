import { Request, Response, NextFunction } from 'express';
import { Env } from '../types';

/**
 * Middleware to enforce OpenAI-style API key authentication if OPENAI_API_KEY is set in the environment.
 * Checks for 'Authorization: Bearer <key>' header on protected routes.
 */
export const openAIApiKeyAuth = async (req: Request, res: Response, next: NextFunction) => {
    const env = (req as any).env as Env;

	// If OPENAI_API_KEY is set in environment, require authentication
	if (env.OPENAI_API_KEY) {
		const authHeader = req.header("Authorization");

		if (!authHeader) {
			return res.status(401).json(
				{
					error: {
						message: "Missing Authorization header",
						type: "authentication_error",
						code: "missing_authorization"
					}
				}
			);
		}

		// Check for Bearer token format
		const match = authHeader.match(/^Bearer\s+(.+)$/);
		if (!match) {
			return res.status(401).json(
				{
					error: {
						message: "Invalid Authorization header format. Expected: Bearer <token>",
						type: "authentication_error",
						code: "invalid_authorization_format"
					}
				}
			);
		}

		const providedKey = match[1];
		if (providedKey !== env.OPENAI_API_KEY) {
			return res.status(401).json(
				{
					error: {
						message: "Invalid API key",
						type: "authentication_error",
						code: "invalid_api_key"
					}
				}
			);
		}
	}

	next();
};