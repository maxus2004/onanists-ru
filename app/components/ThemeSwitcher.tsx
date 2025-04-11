"use client";

import { HiOutlineSun as SunIcon, HiOutlineMoon as MoonIcon } from "react-icons/hi";
import { useState, useEffect } from "react";
import { useTheme } from "next-themes";

export default function ThemeSwitch() {
    const [mounted, setMounted] = useState(false);
    const { systemTheme, theme, setTheme } = useTheme();
    const currentTheme = theme === "system" ? systemTheme : theme;

    useEffect(() => setMounted(true), []);

    if (!mounted) return null;

    if (currentTheme === "dark") {
        return <SunIcon className="h-8 w-8" onClick={ async () => {
            setTheme("light");
            document.cookie = 'theme=light';
            document.dispatchEvent(new Event('theme-change'));
        }}  />;
    } else {
        return (<MoonIcon className="h-8 w-8 " onClick={ async () => {
            setTheme("dark");
            document.cookie = 'theme=dark';
            document.dispatchEvent(new Event('theme-change'));
        }} />);
    }
}