import { apiRoute } from "@/lib/server/api";
import { availableCompilerVersions, bundledCompiler } from "@/lib/server/compiler/solc-versions";
import { json } from "@/lib/server/http";

export const GET = apiRoute(async () => {
  const { versions, offline } = await availableCompilerVersions();
  return json({ versions: versions.filter((v) => v.startsWith("0.8.") || v.startsWith("0.7.") || v.startsWith("0.6.")), offline, bundled: bundledCompiler().version });
});
