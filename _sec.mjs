import { createClient } from "@supabase/supabase-js";
const url="https://fzoombsxvscndzrhzmwb.supabase.co";
const anon="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6b29tYnN4dnNjbmR6cmh6bXdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4MDkzMDMsImV4cCI6MjA5NjM4NTMwM30.kyuQIWCihIcgO7wN-t-YRwB8FrIWJT3MqApbzLeCamc";
const sb=createClient(url,anon);
const sel=await sb.from("orders").select("*");
console.log("익명 SELECT rows:", sel.data?sel.data.length:("(error) "+sel.error?.message));
const ins=await sb.from("orders").insert({name:"__HACK__",ym:"2026-06",order_date:"2026-06-01",qty:1});
console.log("익명 INSERT:", ins.error?("차단됨 ✅ ("+ins.error.message.slice(0,60)+")"):"성공함 ❌ (문제!)");
