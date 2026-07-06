"use client";

import { useState, useEffect } from "react";
import NumberFlow from "@number-flow/react";
import { FooterBunny } from "./FooterBunny";

const laFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

interface LATime {
  hour: number;
  minute: number;
  period: "am" | "pm";
}

function getLATime(date: Date): LATime {
  const parts = laFormatter.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return {
    hour: parseInt(get("hour"), 10),
    minute: parseInt(get("minute"), 10),
    period: get("dayPeriod").toLowerCase() === "pm" ? "pm" : "am",
  };
}

// Bunny sleeps between 10pm and 7am LA time
function isSleeping({ hour, period }: LATime) {
  return period === "pm" ? hour >= 10 && hour !== 12 : hour === 12 || hour < 7;
}

export function Footer() {
  const [time, setTime] = useState<LATime | null>(null);
  const [sleeping, setSleeping] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 600);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const update = () => {
      const now = getLATime(new Date());
      setTime(now);
      setSleeping(isSleeping(now));
    };
    update();
    let interval: ReturnType<typeof setInterval> | undefined;
    const timeout = setTimeout(
      () => {
        update();
        interval = setInterval(update, 60000);
      },
      60000 - (Date.now() % 60000),
    );
    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, []);

  return (
    <footer className="footer">
      <div className="footer-container">
        <div className="footer-row">
          <p style={{ fontVariantNumeric: "tabular-nums" }}>
            <span
              style={{
                opacity: time && visible ? 1 : 0,
                transition: "opacity 0.3s ease",
              }}
            >
              <NumberFlow value={time?.hour ?? 12} />:
              <NumberFlow
                value={time?.minute ?? 0}
                format={{ minimumIntegerDigits: 2 }}
              />
              {time?.period ?? "am"} in Los Angeles, California
            </span>{" "}
            <span
              style={{
                display: "inline-block",
                verticalAlign: "bottom",
                marginBottom: "-6px",
                opacity: time && visible ? 1 : 0,
                transition: "opacity 0.3s ease",
              }}
            >
              <FooterBunny size={32} sleeping={sleeping} />
            </span>
          </p>
        </div>
      </div>
    </footer>
  );
}
