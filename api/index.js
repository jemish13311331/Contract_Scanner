// Vercel serverless entry point. Vercel invokes the default export as the handler
// for every request routed here (see vercel.json rewrites → /api/*). The Express
// app is a (req, res) function, so exporting it directly works as a handler.
import app from '../server.js';

export default app;
