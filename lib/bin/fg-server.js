#!/usr/bin/env node
/**
 * Frontend Guardian Dashboard Server CLI
 * Usage: fg-server [options]
 */

import { DashboardServer } from "../dist/index.js";
import pc from "picocolors";

function showHelp() {
    console.log(`
Frontend Guardian Dashboard Server v3.6.1

Usage:
  fg-server [options]

Options:
  --port <n>        Server port (default: 3456)
  --data-dir <dir>  Data storage directory (default: ~/.frontend-guardian-server)
  --cors <origin>   Enable CORS for the given origin (e.g. "*" or "http://localhost:3000")
  --auth-token <t>  Require Bearer token for POST /api/reports
  --help, -h        Show this help

Examples:
  fg-server                          # Start on default port 3456
  fg-server --port 8765              # Start on port 8765
  fg-server --cors "*"               # Enable CORS for all origins
  fg-server --auth-token secret123   # Require auth token for report uploads
`);
}

async function main() {
    const args = process.argv.slice(2);

    const options = {
        port: 3456,
        dataDir: undefined,
        cors: undefined,
        authToken: undefined,
    };

    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case "--port":
                options.port = parseInt(args[++i], 10) || 3456;
                break;
            case "--data-dir":
                options.dataDir = args[++i];
                break;
            case "--cors":
                options.cors = args[++i];
                break;
            case "--auth-token":
                options.authToken = args[++i];
                break;
            case "--help":
            case "-h":
                showHelp();
                process.exit(0);
        }
    }

    console.log(pc.cyan("Frontend Guardian Dashboard Server"));
    console.log(pc.gray(`   Version: 3.5.2`));
    console.log("");

    const server = new DashboardServer({
        dataDir: options.dataDir,
        cors: options.cors,
        authToken: options.authToken,
    });

    // Graceful shutdown
    process.on("SIGINT", async () => {
        console.log(pc.gray("\nShutting down..."));
        await server.stop();
        process.exit(0);
    });

    process.on("SIGTERM", async () => {
        await server.stop();
        process.exit(0);
    });

    await server.start(options.port);

    console.log(pc.green(`   Server: http://localhost:${options.port}`));
    console.log(pc.gray(`   Data directory: ${server.getDataDir()}`));
    if (options.cors) {
        console.log(pc.gray(`   CORS: ${options.cors}`));
    }
    if (options.authToken) {
        console.log(pc.gray(`   Auth: Bearer token required for uploads`));
    }
    console.log("");
    console.log(pc.gray("Press Ctrl+C to stop"));
}

main().catch((err) => {
    console.error(pc.red("Server error:"), err.message || err);
    process.exit(1);
});
