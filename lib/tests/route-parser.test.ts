import { describe, it, expect } from "vitest";
import {
    parseNextJsRoutes,
    parseNuxtRoutes,
    parseUniAppRoutes,
    parseReactRouterConfig,
    parseVueRouterConfig,
    detectRouteFramework,
    parseRoutes,
} from "../src/utils/route-parser.js";

describe("v3.7.0 — RouteParser", () => {
    describe("detectRouteFramework", () => {
        it("should detect Next.js", () => {
            expect(detectRouteFramework("/project", "/project/pages/index.tsx")).toBe("nextjs");
            expect(detectRouteFramework("/project", "/project/app/blog/page.tsx")).toBe("nextjs");
        });

        it("should detect Nuxt", () => {
            expect(detectRouteFramework("/project", "/project/pages/index.vue")).toBe("nuxt");
            expect(detectRouteFramework("/project", "/project/pages/about.vue")).toBe("nuxt");
        });

        it("should detect UniApp", () => {
            expect(detectRouteFramework("/project", "/project/pages.json")).toBe("uniapp");
        });

        it("should detect React Router", () => {
            expect(detectRouteFramework("/project", "/project/src/routes.tsx")).toBe("react-router");
        });

        it("should detect Vue Router", () => {
            expect(detectRouteFramework("/project", "/project/src/router.ts")).toBe("vue-router");
        });

        it("should return unknown for non-route files", () => {
            expect(detectRouteFramework("/project", "/project/src/utils.ts")).toBe("unknown");
        });
    });

    describe("parseNextJsRoutes", () => {
        it("should parse pages/index.tsx", () => {
            const routes = parseNextJsRoutes("pages/index.tsx");
            expect(routes.length).toBe(1);
            expect(routes[0].path).toBe("/");
            expect(routes[0].framework).toBe("nextjs");
        });

        it("should parse pages/about.tsx", () => {
            const routes = parseNextJsRoutes("pages/about.tsx");
            expect(routes[0].path).toBe("/about");
        });

        it("should parse pages/blog/[slug].tsx", () => {
            const routes = parseNextJsRoutes("pages/blog/[slug].tsx");
            expect(routes[0].path).toBe("/blog/:slug");
        });

        it("should parse app/blog/page.tsx", () => {
            const routes = parseNextJsRoutes("app/blog/page.tsx");
            expect(routes[0].path).toBe("/blog");
        });

        it("should ignore non-page files", () => {
            const routes = parseNextJsRoutes("src/utils.ts");
            expect(routes.length).toBe(0);
        });
    });

    describe("parseNuxtRoutes", () => {
        it("should parse pages/index.vue", () => {
            const routes = parseNuxtRoutes("pages/index.vue");
            expect(routes.length).toBe(1);
            expect(routes[0].path).toBe("/");
            expect(routes[0].framework).toBe("nuxt");
        });

        it("should parse pages/about.vue", () => {
            const routes = parseNuxtRoutes("pages/about.vue");
            expect(routes[0].path).toBe("/about");
        });

        it("should parse pages/user/[id].vue", () => {
            const routes = parseNuxtRoutes("pages/user/[id].vue");
            expect(routes[0].path).toBe("/user/:id");
        });
    });

    describe("parseUniAppRoutes", () => {
        it("should parse pages.json", () => {
            const content = JSON.stringify({
                pages: [
                    { path: "pages/index/index" },
                    { path: "pages/about/about" },
                ],
            });
            const routes = parseUniAppRoutes(content, "pages.json");
            expect(routes.length).toBe(2);
            expect(routes[0].path).toBe("/pages/index/index");
            expect(routes[1].path).toBe("/pages/about/about");
        });

        it("should parse subPackages", () => {
            const content = JSON.stringify({
                pages: [{ path: "pages/index/index" }],
                subPackages: [
                    {
                        root: "packageA",
                        pages: [{ path: "pages/list/list" }],
                    },
                ],
            });
            const routes = parseUniAppRoutes(content, "pages.json");
            expect(routes.length).toBe(2);
            expect(routes.some((r) => r.path === "/packageA/pages/list/list")).toBe(true);
        });
    });

    describe("parseReactRouterConfig", () => {
        it("should parse Route path", () => {
            const content = `
                <Route path="/about" element={<About />} />
                <Route path="/users/:id" element={<User />} />
            `;
            const routes = parseReactRouterConfig(content, "routes.tsx");
            expect(routes.length).toBe(2);
            expect(routes[0].path).toBe("/about");
        });
    });

    describe("parseVueRouterConfig", () => {
        it("should parse route paths", () => {
            const content = `
                const routes = [
                    { path: '/home', component: Home },
                    { path: '/about', component: () => import('./About.vue') },
                ];
            `;
            const routes = parseVueRouterConfig(content, "router.ts");
            expect(routes.length).toBe(2);
            expect(routes[0].path).toBe("/home");
            expect(routes[0].component).toBe("Home");
            expect(routes[1].path).toBe("/about");
        });
    });

    describe("parseRoutes integration", () => {
        it("should parse Next.js routes from file", () => {
            const routes = parseRoutes("/project", "/project/pages/index.tsx", "// placeholder");
            expect(routes.framework).toBe("nextjs");
            expect(routes.routes.length).toBe(1);
            expect(routes.routes[0].path).toBe("/");
        });

        it("should parse Nuxt routes from file", () => {
            const routes = parseRoutes("/project", "/project/pages/about.vue", "<template></template>");
            expect(routes.framework).toBe("nuxt");
            expect(routes.routes.length).toBe(1);
            expect(routes.routes[0].path).toBe("/about");
        });
    });
});
