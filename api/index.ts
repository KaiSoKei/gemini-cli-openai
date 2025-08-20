import console from "console";

import express from "express";
const app = express();

app.get("/", (req: any, res: { send: (arg0: string) => any; }) => res.send("Express on Vercel"));

app.listen(3000, () => console.log("Server ready on port 3000."));

module.exports = app;