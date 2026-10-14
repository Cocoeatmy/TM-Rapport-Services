import fs from "node:fs";
const T = fs.readFileSync(process.argv[2],"utf8").trim();
const H = { Cookie: "auth-token="+T };
const pid = "3cf1895b-9179-81a5-8e4c-fac6f9b609f3";
for (let i=0;i<6;i++){
  const r = await fetch(`https://tm-rapport-services.vercel.app/api/defauts?projectId=${pid}`,{headers:H});
  const d = await r.json();
  console.log(`sans rv #${i+1} | age:`, r.headers.get("age"), "| cache:", r.headers.get("x-vercel-cache"), "|", JSON.stringify(d[0]?.description));
}
