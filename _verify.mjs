import { createClient } from "@supabase/supabase-js";
const url="https://fzoombsxvscndzrhzmwb.supabase.co";
const key="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6b29tYnN4dnNjbmR6cmh6bXdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4MDkzMDMsImV4cCI6MjA5NjM4NTMwM30.kyuQIWCihIcgO7wN-t-YRwB8FrIWJT3MqApbzLeCamc";
const sb=createClient(url,key);
const row={order_no:"TEST-1",order_date:"2026-06-01",ym:"2026-06",gubun:"제품",name:"__TEST__",spec:"x",qty:1,customer:"t",note:""};
const ins=await sb.from("orders").insert(row).select();
console.log("INSERT:", ins.error?("ERR "+ins.error.message):("ok id="+ins.data[0].id));
const id=ins.data?.[0]?.id;
const sel=await sb.from("orders").select("*").eq("name","__TEST__");
console.log("SELECT count:", sel.error?("ERR "+sel.error.message):sel.data.length);
if(id){const del=await sb.from("orders").delete().eq("id",id);console.log("DELETE:", del.error?("ERR "+del.error.message):"ok");}
