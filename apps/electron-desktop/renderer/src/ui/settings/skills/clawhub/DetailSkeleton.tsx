import React from "react";
import s from "./ClawHubDetailPage.module.css";

export function SkeletonBar({
  width,
  height = 14,
  className,
}: {
  width: string;
  height?: number;
  className?: string;
}) {
  return <span className={`${s.UiSkelBar} ${className ?? ""}`} style={{ width, height }} />;
}

export function DetailSkeleton() {
  return (
    <div className={s.UiDetailLayout}>
      {/* Left column skeleton */}
      <div className={s.UiDetailMain}>
        <div className={s.UiDetailTitleRow}>
          <span className={s.UiSkelCircle} style={{ width: 36, height: 36 }} />
          <SkeletonBar width="40%" height={26} />
        </div>
        <SkeletonBar width="75%" height={14} className={s.UiSkelSpacerSm} />
        <div className={s.UiSkelRow}>
          <SkeletonBar width="90px" height={12} />
          <SkeletonBar width="60px" height={12} />
        </div>
        <div className={s.UiSkelRow}>
          <SkeletonBar width="60px" height={22} />
          <SkeletonBar width="50px" height={22} />
        </div>

        {/* Markdown area */}
        <div className={s.UiSkelMdBlock}>
          <SkeletonBar width="100%" height={14} />
          <SkeletonBar width="92%" height={14} />
          <SkeletonBar width="85%" height={14} />
          <SkeletonBar width="100%" height={14} />
          <SkeletonBar width="60%" height={14} />
          <SkeletonBar width="100%" height={14} />
          <SkeletonBar width="78%" height={14} />
          <SkeletonBar width="95%" height={14} />
          <SkeletonBar width="45%" height={14} />
        </div>

        {/* Section placeholder */}
        <div className={s.UiSkelSection}>
          <SkeletonBar width="130px" height={16} />
          <div className={s.UiSkelCardPlaceholder}>
            <SkeletonBar width="120px" height={14} />
            <SkeletonBar width="100%" height={12} />
            <SkeletonBar width="80%" height={12} />
          </div>
        </div>
      </div>

      {/* Sidebar skeleton */}
      <div className={s.UiDetailSidebar}>
        <div className={s.UiSkelSidebarBlock}>
          <SkeletonBar width="50px" height={12} />
          <SkeletonBar width="90px" height={18} />
        </div>
        <div className={s.UiSkelSidebarBlock}>
          <SkeletonBar width="55px" height={12} />
          <SkeletonBar width="80px" height={16} />
        </div>
        <div className={s.UiSkelSidebarBlock}>
          <SkeletonBar width="80px" height={28} className={s.UiSkelButton} />
        </div>
        <div className={s.UiSkelSidebarBlock}>
          <SkeletonBar width="65px" height={12} />
          <div className={s.UiSkelStatsGrid}>
            <div className={s.UiSkelStatItem}>
              <SkeletonBar width="36px" height={20} />
              <SkeletonBar width="32px" height={10} />
            </div>
            <div className={s.UiSkelStatItem}>
              <SkeletonBar width="36px" height={20} />
              <SkeletonBar width="48px" height={10} />
            </div>
            <div className={s.UiSkelStatItem}>
              <SkeletonBar width="36px" height={20} />
              <SkeletonBar width="38px" height={10} />
            </div>
          </div>
        </div>
        <div className={s.UiSkelSidebarBlock}>
          <SkeletonBar width="50px" height={12} />
          <div className={s.UiSkelRow}>
            <span className={s.UiSkelCircle} style={{ width: 24, height: 24 }} />
            <SkeletonBar width="100px" height={14} />
          </div>
        </div>
      </div>
    </div>
  );
}
