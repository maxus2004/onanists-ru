"use client";

import Collapse from "./CollapsibleButton";
import HrefBlock from "@/app/components/HrefBlock";
import React from "react";
import { useState, useEffect } from "react";

const html_ext = '.html';
const pdf_ext = '.pdf';

export default function Subject({subjectName}: {subjectName:string}) {
    const [ data, setData] = useState<string[]>([]);
    const [ theme, setTheme ] = useState("dark");
    const currentTheme = theme === "light" ? "light" : "dark";

    const fetchData = async (subjectName: string)  => {
        const request = await fetch('/api/get-files?dir=' + encodeURIComponent(subjectName));
        const json = await request.json();
        setData(json.files);
        // @ts-expect-error item is implicitly any too lazy to fix for now
        if (Array.isArray(json.files) && json.files.every(item => typeof item === 'string')) {
            setData(json.files);
        } else {
            alert("Bad JSON Data")
        }
    }
    useEffect(() => {
        fetchData(subjectName);

        const themeChangeHandler = () => {
            setTheme(theme === 'dark' ? 'light' : 'dark');
        }

        document.addEventListener('theme-change', themeChangeHandler as EventListener);

        const getTheme = () => {
            const cookieValue = document.cookie
                .split('; ')
                .find((row) => row.startsWith('theme='))
                ?.split('=')[1];

            if (cookieValue === 'dark' || cookieValue === 'light') {
                setTheme(cookieValue);
            }
        }

        getTheme();
        return () => document.removeEventListener('theme-change', themeChangeHandler as EventListener);
    }, [subjectName, theme]);
    const noteFilenames = data.sort((a: string, b: string): number => {
        if (a.startsWith('README')) return -1;
        if (a.startsWith('Лекция') && b.startsWith('Лекция') ||
            a.startsWith('Семинар') && b.startsWith('Семинар')) {
            return (parseInt(a.split(' ')[1]) > parseInt(b.split(' ')[1]) ? 1 : -1);
        } else if (a.startsWith('Лекция')) return -1;
        else return 1;
    });
    return (
        <Collapse name={subjectName}>
            <div className="flex-col w-full text-[15px] mt-2 mb-2">
                {
                    noteFilenames.map((filename:string, index: number) => {
                        const themedFilename = filename + (currentTheme == 'dark' ? ' darkmode' : ' lightmode');
                        return(
                            <HrefBlock key={index} name={filename} href_html={`files/${subjectName}/${themedFilename}${html_ext}`} href_pdf={`files/${subjectName}/${themedFilename}${pdf_ext}`} />
                    )})
                }
            </div>
        </Collapse>
    )
}
