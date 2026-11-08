"use client";
import dynamic from "next/dynamic";
export const ClientHome = dynamic(() => import("./home").then((m) => m.Home), { ssr: false });
