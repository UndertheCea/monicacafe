import { GraphQLClient } from "graphql-request";

const endpoint = process.env.NEXT_PUBLIC_GRAPHQL_URL ?? "http://localhost:4000/graphql";

export const gqlClient = new GraphQLClient(endpoint, {
  credentials: "include",
});

export function authedClient(accessToken: string) {
  return new GraphQLClient(endpoint, {
    headers: { Authorization: `Bearer ${accessToken}` },
    credentials: "include",
  });
}
