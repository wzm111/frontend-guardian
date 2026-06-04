/**
 * CODEOWNERS parser
 *
 * Parses CODEOWNERS file from project root to infer issue assignees.
 * Supports GitHub-style CODEOWNERS: .github/CODEOWNERS, CODEOWNERS, docs/CODEOWNERS
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { minimatch } from "minimatch";

export interface CodeownersEntry {
    pattern: string;
    owners: string[];
}

export interface CodeownersResult {
    entries: CodeownersEntry[];
    sourcePath?: string;
}

const CODEOWNERS_PATHS = [".github/CODEOWNERS", "CODEOWNERS", "docs/CODEOWNERS"];

export function findCodeowners(projectDir: string): { content: string; path: string } | null {
    for (const relative of CODEOWNERS_PATHS) {
        const fullPath = resolve(projectDir, relative);
        if (existsSync(fullPath)) {
            try {
                const content = readFileSync(fullPath, "utf-8");
                return { content, path: relative };
            } catch {
                continue;
            }
        }
    }
    return null;
}

export function parseCodeowners(content: string): CodeownersEntry[] {
    const entries: CodeownersEntry[] = [];

    for (const rawLine of content.split("\n")) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#")) continue;

        const parts = line.split(/\s+/);
        if (parts.length < 2) continue;

        const pattern = parts[0];
        const owners = parts.slice(1).filter((p) => p.startsWith("@"));
        if (owners.length === 0) continue;

        entries.push({ pattern, owners });
    }

    return entries;
}

export function loadCodeowners(projectDir: string): CodeownersResult {
    const found = findCodeowners(projectDir);
    if (!found) return { entries: [] };
    return { entries: parseCodeowners(found.content), sourcePath: found.path };
}

export function matchOwner(filePath: string, entries: CodeownersEntry[]): string | undefined {
    let matchedOwner: string | undefined;
    for (const entry of entries) {
        if (matchPattern(filePath, entry.pattern)) {
            matchedOwner = entry.owners[0].replace(/^@/, "");
        }
    }
    return matchedOwner;
}

function matchPattern(filePath: string, pattern: string): boolean {
    let glob = pattern;
    if (glob.startsWith("/")) glob = glob.slice(1);
    if (glob.endsWith("/")) glob = `${glob}**`;
    if (!glob.includes("/") && !glob.startsWith("*")) glob = `**/${glob}`;
    return minimatch(filePath, glob, { dot: true });
}

export class CodeownersParser {
    private entries: CodeownersEntry[];
    private sourcePath?: string;

    constructor(projectDir: string) {
        const result = loadCodeowners(projectDir);
        this.entries = result.entries;
        this.sourcePath = result.sourcePath;
    }

    hasCodeowners(): boolean {
        return this.entries.length > 0;
    }

    getSourcePath(): string | undefined {
        return this.sourcePath;
    }

    getOwner(filePath: string): string | undefined {
        return matchOwner(filePath, this.entries);
    }

    getEntries(): CodeownersEntry[] {
        return this.entries;
    }
}
