import fs from "node:fs";
import Landing from "@/components/Landing";

export default function Page() {
  const version = fs.readFileSync("../VERSION", "utf8").trim();
  return <Landing version={version} />;
}
