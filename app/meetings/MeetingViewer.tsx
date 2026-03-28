'use client';

import { useState } from 'react';
import { useProjectContext } from './useProjectContext';
import { useMeetingData } from './useMeetingData';
import MeetingList from './MeetingList';
import MeetingDetail from './MeetingDetail';

export default function MeetingViewer() {
  const projectCtx = useProjectContext();
  const [hasFacilitator, setHasFacilitator] = useState(projectCtx.hasFacilitator);

  // Keep hasFacilitator in sync with initial load, but allow local override
  // (e.g. after user adds facilitator inline)
  const effectiveHasFacilitator = hasFacilitator ?? projectCtx.hasFacilitator;

  const meetingData = useMeetingData(projectCtx.activeProject, effectiveHasFacilitator, setHasFacilitator);

  if (!meetingData.selected) {
    return (
      <MeetingList
        {...meetingData}
        activeProject={projectCtx.activeProject}
        hasProject={projectCtx.hasProject}
        hasFacilitator={effectiveHasFacilitator}
      />
    );
  }

  return (
    <MeetingDetail
      {...meetingData}
      activeProject={projectCtx.activeProject}
      onBack={() => {
        meetingData.selectMeeting(null);
        meetingData.setUserExplicitlyBack(true);
      }}
    />
  );
}
