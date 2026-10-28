'use client';
import Link from 'next/link';
import { ReactNode } from 'react';
import { WanderlyEventType } from '@/lib/events';
import { track } from '@/lib/tracking';
export function TrackedLink({href,eventType,entity,className,children}:{href:string,eventType:WanderlyEventType,entity?:string,className?:string,children:ReactNode}){
 return <Link href={href} className={className} onClick={()=>track(eventType,window.location.pathname,entity)}>{children}</Link>
}
export function TrackedButton({eventType,entity,className,children,onClick}:{eventType:WanderlyEventType,entity?:string,className?:string,children:ReactNode,onClick?:()=>void}){
 return <button className={className} type="button" onClick={()=>{track(eventType,window.location.pathname,entity);onClick?.()}}>{children}</button>
}
export function PackageLink({href,packageSlug,children}:{href:string,packageSlug:string,children:ReactNode}){
 return <Link href={href} onClick={()=>{track('PACKAGE_VIEW',window.location.pathname,packageSlug);track('PRICE_VIEW',window.location.pathname,packageSlug)}}>{children}</Link>
}
