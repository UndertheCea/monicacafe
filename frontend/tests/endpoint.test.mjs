// GraphQL endpoint selection (lib/endpoint.ts, #210). Run with `npm test`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { DEV_GRAPHQL_URL, browserGraphqlUrl, serverGraphqlUrl } from "../lib/endpoint.ts";

test("browserGraphqlUrl", () => {
  const cases = [
    {
      name: "production build: same origin, whatever the host and port",
      env: { nodeEnv: "production" },
      origin: "http://localhost:8080",
      want: "http://localhost:8080/graphql",
    },
    { name: "production on a domain", env: { nodeEnv: "production" }, origin: "https://moni.example", want: "https://moni.example/graphql" },
    { name: "no NODE_ENV counts as production", env: {}, origin: "https://moni.example", want: "https://moni.example/graphql" },
    { name: "next dev talks to the API port", env: { nodeEnv: "development" }, origin: "http://localhost:3000", want: DEV_GRAPHQL_URL },
    {
      name: "an absolute override wins",
      env: { nodeEnv: "production", publicUrl: "https://api.moni.example/graphql" },
      origin: "https://moni.example",
      want: "https://api.moni.example/graphql",
    },
    {
      name: "a relative override resolves against the page",
      env: { nodeEnv: "development", publicUrl: "/graphql" },
      origin: "http://localhost:3000",
      want: "http://localhost:3000/graphql",
    },
    { name: "a blank override is ignored", env: { nodeEnv: "production", publicUrl: "  " }, origin: "http://a.tw", want: "http://a.tw/graphql" },
  ];
  for (const c of cases) assert.equal(browserGraphqlUrl(c.env, c.origin), c.want, c.name);
});

test("serverGraphqlUrl", () => {
  const cases = [
    { name: "compose: the internal URL", env: { internalUrl: "http://backend:4000/graphql", publicUrl: "/graphql" }, want: "http://backend:4000/graphql" },
    { name: "absolute override when there's no internal URL", env: { publicUrl: "https://api.moni.example/graphql" }, want: "https://api.moni.example/graphql" },
    { name: "a relative override can't be used on the server", env: { publicUrl: "/graphql" }, want: DEV_GRAPHQL_URL },
    { name: "nothing set", env: {}, want: DEV_GRAPHQL_URL },
  ];
  for (const c of cases) assert.equal(serverGraphqlUrl(c.env), c.want, c.name);
});
