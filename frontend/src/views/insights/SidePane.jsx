import FilePane from '../code/FilePane.jsx';
import Tabs from '../Tabs.jsx';
import CyclesTab from './CyclesTab.jsx';
import HotspotsTab from './HotspotsTab.jsx';
import StartHereTab from './StartHereTab.jsx';
import './insights.css';

// The right-hand side of the graph screen. One tab for the open file, and one for each
// repository-wide insight: hotspots, circular imports and where to start.
export default function SidePane({ snapshotId, graph, onboarding, health, explorer, actions }) {
  const cycleCount = graph.cycles.length;
  const tabs = [
    { id: 'file', label: 'File' },
    { id: 'hotspots', label: 'Hotspots' },
    { id: 'cycles', label: cycleCount > 0 ? `Cycles (${cycleCount})` : 'Cycles' },
    { id: 'start', label: 'Start here' },
  ];

  return (
    <div className="sidepane">
      <Tabs tabs={tabs} active={explorer.tab} onChange={actions.setTab} />
      <div className="sidepane__body">
        {explorer.tab === 'file' && (
          <FilePane
            snapshotId={snapshotId}
            target={explorer.target}
            onOpenFile={actions.open}
            onJump={actions.jump}
          />
        )}
        {explorer.tab === 'hotspots' && <HotspotsTab health={health} onOpen={actions.open} />}
        {explorer.tab === 'cycles' && (
          <CyclesTab
            cycles={graph.cycles}
            activeId={explorer.activeCycleId}
            onSelect={actions.selectCycle}
            onOpen={actions.open}
          />
        )}
        {explorer.tab === 'start' && <StartHereTab onboarding={onboarding} onOpen={actions.open} />}
      </div>
    </div>
  );
}
