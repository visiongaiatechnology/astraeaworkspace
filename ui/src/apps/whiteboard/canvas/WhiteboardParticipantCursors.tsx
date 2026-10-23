// STATUS: DIAMANT VGT SUPREME
import React from 'react';
import { MousePointer2 } from 'lucide-react';
import type { WhiteboardParticipantCursor } from '../../../shared/contracts/workspace';

interface Props { participants: WhiteboardParticipantCursor[]; hideNames: boolean; }
export const WhiteboardParticipantCursors:React.FC<Props>=({participants,hideNames})=><>
  {participants.map(participant=><div key={participant.id} className="pointer-events-none absolute z-50" style={{left:participant.x,top:participant.y}} aria-label={hideNames?'Participant cursor':`${participant.name} cursor`}><MousePointer2 className="h-5 w-5 fill-cyan-300/30 text-cyan-300 drop-shadow"/>{!hideNames&&<span className="ml-3 -mt-1 block max-w-32 truncate rounded bg-cyan-950/90 px-2 py-1 text-[0.5625rem] font-semibold text-cyan-100 shadow-lg">{participant.name}</span>}</div>)}
</>;
