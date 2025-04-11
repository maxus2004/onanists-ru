import React from "react";

export default function HrefBlock({name, href_html, href_pdf}: {name: string; href_html: string, href_pdf: string}) {
    return (
        <div className="flex w-full">
            <div className="w-1/2 flex items-center justify-self-start">{name}</div>
            <div className="flex w-1/2 items-stretch">
                <div className="w-1/2 mr-1 pb-1 justify-items-center h-full"><a href={href_html}><button className="hrefbutton w-full" role="button">HTML</button></a></div>
                <div className="w-1/2 ml-1 pb-1"><a href={href_pdf}><button className="hrefbutton w-full" role="button">PDF</button></a></div>
            </div>
        </div>
    );
}