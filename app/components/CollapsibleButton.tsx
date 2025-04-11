"use client";

import { HiOutlineChevronDown as DownArrow } from "react-icons/hi";
import { HiOutlineChevronUp as UpArrow} from "react-icons/hi";
import React, { ReactNode } from "react";
import { useCollapse } from "react-collapsed";

interface Props {
    name: string;
    children: ReactNode;
}

export default function Collapse({name, children}: Props) {
    const { getCollapseProps, getToggleProps, isExpanded } = useCollapse();
    const correctedName =  name ? name : "YOU DONE FUCKED UP";
    return (
        <div className="collapsible flex-col items-center w-full justify-between mt-2 mb-4 max-w-180">
            <button {...getToggleProps() } className="header flex items-center justify-between w-full rounded text-xl font-bold">
                {correctedName}
                { isExpanded ? <UpArrow /> : <DownArrow /> }
            </button>
            <div  {...getCollapseProps()}
                  className="content flex align-baseline ml-1 mr-2 text-s items-baseline justify-between"
            >
                {children}
            </div>
        </div>
    );
}