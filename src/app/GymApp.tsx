"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { buildGymAppHtml } from "./gymHtml";
import { GYM_APP_SCRIPT } from "./gymScript";

export default function GymApp({
  userId,
  email,
}: {
  userId: string;
  email: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scriptInjected = useRef(false);

  useEffect(() => {
    if (scriptInjected.current) return;
    scriptInjected.current = true;

    const setAppHeight = () => {
      const long = Math.max(window.screen.width, window.screen.height);
      const portrait = window.innerHeight > window.innerWidth;
      const h = portrait ? Math.max(window.innerHeight, long) : window.innerHeight;
      document.documentElement.style.setProperty("--app-h", `${h}px`);
    };
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) {
      setAppHeight();
      window.addEventListener("resize", setAppHeight);
      window.addEventListener("orientationchange", setAppHeight);
    }

    const supabase = createClient();
    (window as unknown as { supabase: typeof supabase }).supabase = supabase;
    (window as unknown as { currentUserId: string }).currentUserId = userId;

    const script = document.createElement("script");
    script.textContent = GYM_APP_SCRIPT;
    document.body.appendChild(script);
  }, [userId]);

  return (
    <div
      id="app"
      ref={containerRef}
      dangerouslySetInnerHTML={{ __html: buildGymAppHtml(email) }}
    />
  );
}
