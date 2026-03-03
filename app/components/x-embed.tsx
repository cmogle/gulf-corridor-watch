"use client";

/**
 * XEmbed – renders an official Twitter/X embedded tweet using the
 * platform.twitter.com widget script. Falls back gracefully to a
 * plain "Open post" link if JS is disabled or the script fails.
 *
 * Why not twitframe.com? It's a dead third-party domain that redirects
 * to an unrelated Vietnamese site. We use the native embed instead.
 */

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    twttr?: {
      widgets?: {
        load: (el?: HTMLElement) => void;
      };
    };
  }
}

type XEmbedProps = {
  url: string;
  postId: string;
  className?: string;
};

export function XEmbed({ url, postId, className }: XEmbedProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Load the Twitter widget script once
    const SCRIPT_ID = "twitter-wjs";
    if (!document.getElementById(SCRIPT_ID)) {
      const script = document.createElement("script");
      script.id = SCRIPT_ID;
      script.src = "https://platform.twitter.com/widgets.js";
      script.async = true;
      script.charset = "utf-8";
      document.body.appendChild(script);
    }

    // Ask the widget loader to process the new blockquote
    const tryLoad = () => {
      if (window.twttr?.widgets?.load && containerRef.current) {
        window.twttr.widgets.load(containerRef.current);
      }
    };

    // If script already loaded, run immediately; otherwise wait a tick
    if (window.twttr?.widgets) {
      tryLoad();
    } else {
      const t = setTimeout(tryLoad, 1500);
      return () => clearTimeout(t);
    }
  }, [url]);

  return (
    <div
      ref={containerRef}
      className={`min-h-[120px] w-full overflow-hidden rounded-md ${className ?? ""}`}
    >
      <blockquote
        className="twitter-tweet"
        data-dnt="true"
        data-theme="light"
        data-conversation="none"
      >
        <a href={url}>Post by @{extractHandle(url) ?? postId}</a>
      </blockquote>
    </div>
  );
}

function extractHandle(url: string): string | null {
  try {
    const match = new URL(url).pathname.match(/^\/([^/]+)\//);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}
