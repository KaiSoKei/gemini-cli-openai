import express from 'express';
import { Env } from './types';
import { OpenAIRoute } from './routes/openai';
import { DebugRoute } from './routes/debug';
import { openAIApiKeyAuth } from './middlewares/auth';
import { loggingMiddleware } from './middlewares/logging';
import cors from 'cors';

export const createApp = (customEnv?: Partial<Env>) => {
    const app = express();

    // Middleware to inject custom env for local development
    app.use((req, res, next) => {
        if (customEnv) {
            (req as any).env = { ...process.env, ...customEnv };
        }
        next();
    });

    app.use(express.json());

    // Add logging middleware
    app.use(loggingMiddleware);

    // Add CORS headers for all requests
    app.use(cors());

    // Apply OpenAI API key authentication middleware to all /v1 routes
    app.use('/v1', openAIApiKeyAuth);

    // Setup route handlers
    app.use('/v1', OpenAIRoute);
    app.use('/v1/debug', DebugRoute);

    // Root endpoint - basic info about the service
    app.get('/', (req, res) => {
        const requiresAuth = !!(req as any).env.OPENAI_API_KEY;

        res.json({
            name: 'Gemini CLI OpenAI Worker',
            description: 'OpenAI-compatible API for Google Gemini models via OAuth',
            version: '1.0.0',
            authentication: {
                required: requiresAuth,
                type: requiresAuth ? 'Bearer token in Authorization header' : 'None'
            },
            endpoints: {
                chat_completions: '/v1/chat/completions',
                models: '/v1/models',
                debug: {
                    cache: '/v1/debug/cache',
                    token_test: '/v1/token-test',
                    full_test: '/v1/test'
                }
            },
            documentation: 'https://github.com/KaiSoKei/gemini-cli-openai/tree/NoHonoToExpressJs',
            Author: 'https://github.com/KaiSoKei - (Original Creator: https://github.com/GewoonJaap/)'
        });
    });

    // Health check endpoint
    app.get('/health', (req, res) => {
        res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    return app;
};
