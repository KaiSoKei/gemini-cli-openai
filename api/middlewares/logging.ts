import { Request, Response, NextFunction } from 'express';
import onFinished from 'on-finished';

/**
 * Logging middleware for request/response tracking
 *
 * Logs:
 * - Request start with method, path, and body (for POST/PUT/PATCH)
 * - Request completion with status code and duration
 * - Masks sensitive data in request bodies
 */
export const loggingMiddleware = (req: Request, res: Response, next: NextFunction) => {
	const method = req.method;
	const path = req.path;
	const startTime = Date.now();
	const timestamp = new Date().toISOString();

	// Log request body for POST/PUT/PATCH requests
	let bodyLog = "";
	if (["POST", "PUT", "PATCH"].includes(method) && req.body) {
        const body = JSON.stringify(req.body);

        // Truncate very long bodies and mask sensitive data
        const truncatedBody = body.length > 500 ? body.substring(0, 500) + "..." : body;
        // Mask potential API keys or tokens
        const maskedBody = truncatedBody.replace(/"(api_?key|token|authorization)":\s*"[^"]*"/gi, '"$1": "***"');
        bodyLog = ` - Body: ${maskedBody}`;
	}

	console.log(`[${timestamp}] ${method} ${path}${bodyLog} - Request started`);

    onFinished(res, () => {
        const duration = Date.now() - startTime;
        const status = res.statusCode;
        const endTimestamp = new Date().toISOString();

        console.log(`[${endTimestamp}] ${method} ${path} - Completed with status ${status} (${duration}ms)`);
    });

	next();
};