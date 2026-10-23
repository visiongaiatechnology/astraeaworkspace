import React from 'react';
import type {
  PresentAnimation,
  PresentInkStroke,
  PresentSceneObject,
  PresentSlide,
  WorkspaceObject,
} from '../../../../shared/contracts/workspace';
import { normalizePresentGeometry, normalizePresentImage, sortPresentLayers } from '../../canvas/model/presentScene';
import { ResolvedPresentDesign } from '../../design/presentDesign';
import { ChartRenderer } from '../../../../shared/charts/ChartRenderer';
import { GridLiveReferenceCard, tableFromWorkspaceReference } from '../../../grid/integrations/GridLiveReferenceCard';
import { PresentDiagramRenderer, PresentCodeRenderer } from '../../canvas/rendering/PresentSmartRenderer';
import { PresentWidgetRenderer } from '../../canvas/rendering/PresentWidgetRenderer';
import { PresentWorkspaceSnapshotView } from '../../canvas/rendering/PresentWorkspaceSnapshotView';
import { composeTargetAnimationStyle } from '../../animations/presentAnimationEngine';
import { projectAnimatedChart, scopedPresentAnimationStyle } from '../../animations/presentAnimationRender';

interface PresenterSlideViewProps {
  slide: PresentSlide;
  design: ResolvedPresentDesign;
  currentIdx: number;
  totalSlides: number;
  embeddedObjects: WorkspaceObject[];
  animations: PresentAnimation[];
  animationProgressById: Record<string, number>;
  triggerObjectIds: ReadonlySet<string>;
  onTriggerObject: (targetId: string) => void;
  advancePresentation: () => void;
  laserActive: boolean;
  penActive: boolean;
  laserPos: { xPercent: number; yPercent: number } | null;
  inkStrokes: PresentInkStroke[];
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerUp: () => void;
}

export const PresenterSlideView: React.FC<PresenterSlideViewProps> = ({
  slide,
  design,
  currentIdx,
  totalSlides,
  embeddedObjects,
  animations,
  animationProgressById,
  triggerObjectIds,
  onTriggerObject,
  advancePresentation,
  laserActive,
  penActive,
  laserPos,
  inkStrokes,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}) => {
  const animationStyle = (targetId: string): React.CSSProperties =>
    composeTargetAnimationStyle(animations, targetId, animationProgressById) as React.CSSProperties;
  const scopeStyle = (
    targetId: string,
    scope: PresentAnimation['scope'],
    scopeIndex: number
  ): React.CSSProperties => scopedPresentAnimationStyle(
    animations,
    targetId,
    scope,
    scopeIndex,
    animationProgressById
  ) as React.CSSProperties;
  const triggerable = (targetId: string): boolean => triggerObjectIds.has(targetId);
  const sceneObjects: PresentSceneObject[] = (slide.sceneObjects || []).map((object) => normalizePresentGeometry(object));
  const hasWorkspaceReferences = sceneObjects.some((object) => object.kind === 'workspace');
  // GAP-0052, Runde 285: `trigger` nahm nur `React.MouseEvent`. Die
  // Trigger-Objekte werden jetzt auch per Enter und Leertaste ausgeloest, und
  // ein `KeyboardEvent` ist kein `MouseEvent`. Beide haben `stopPropagation`,
  // mehr wird hier nicht gebraucht — die Signatur nimmt darum beides.
  const trigger = (event: React.MouseEvent | React.KeyboardEvent, targetId: string) => {
    if (!triggerable(targetId)) return;
    event.stopPropagation();
    onTriggerObject(targetId);
  };

  return (
    <div
      key={slide.id}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      className="w-full max-w-5xl aspect-video rounded-2xl border border-white/15 shadow-2xl p-10 md:p-14 flex flex-col justify-between relative overflow-hidden select-none"
      style={{
        backgroundColor: design.backgroundColor,
        fontFamily: design.fontFamily,
        cursor: penActive ? 'crosshair' : laserActive ? 'none' : 'default',
      }}
      onClick={() => { if (!penActive && !laserActive) advancePresentation(); }}
    >
      <div className="relative z-10">
        <span className="text-xs uppercase font-mono px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold">
          {slide.categoryTag || 'Slide Scene'}
        </span>
        <h1
          onClick={(event) => trigger(event, 'slide-title')}
          // GAP-0055, Runde 294: der Titel trug
          // `cursor: triggerable(...) ? 'pointer' : undefined` im STYLE — er
          // SIEHT also bedienbar aus, war es aber nur mit der Maus. Die drei
          // Trigger-Objekte sind dieselbe Klasse wie GAP-0050/0051/0052; mein
          // Parser hatte sie uebersehen, weil er nur `className` las.
          role={triggerable('slide-title') ? 'button' : undefined}
          tabIndex={triggerable('slide-title') ? 0 : undefined}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              trigger(event, 'slide-title');
            }
          }}
          style={{
            ...animationStyle('slide-title'),
            color: design.titleColor,
            cursor: triggerable('slide-title') ? 'pointer' : undefined,
          }}
          className="text-3xl md:text-5xl font-black tracking-tight mt-3"
        >
          {slide.title}
        </h1>
        {slide.subtitle && (
          <p
            onClick={(event) => trigger(event, 'slide-subtitle')}
            // GAP-0055, Runde 294: derselbe Fall wie beim Titel.
            role={triggerable('slide-subtitle') ? 'button' : undefined}
            tabIndex={triggerable('slide-subtitle') ? 0 : undefined}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                trigger(event, 'slide-subtitle');
              }
            }}
            style={{
              ...animationStyle('slide-subtitle'),
              color: design.bodyColor,
              cursor: triggerable('slide-subtitle') ? 'pointer' : undefined,
            }}
            className="text-base md:text-lg mt-2 font-medium"
          >
            {slide.subtitle}
          </p>
        )}
      </div>

      <div className={`relative z-10 flex-1 my-6 flex items-center justify-center ${hasWorkspaceReferences ? 'pr-[30%]' : ''}`}>
        {slide.layout === 'cards' && slide.cards && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 w-full">
            {slide.cards.map((card) => (
              <div
                key={card.id}
                onClick={(event) => trigger(event, card.id)}
                // GAP-0055, Runde 294: derselbe Fall wie bei Titel und
                // Untertitel — der Zeiger-Cursor steht im STYLE.
                role={triggerable(card.id) ? 'button' : undefined}
                tabIndex={triggerable(card.id) ? 0 : undefined}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    trigger(event, card.id);
                  }
                }}
                className="p-5 rounded-2xl border backdrop-blur-sm flex flex-col justify-between space-y-3 bg-slate-900/60 shadow-lg"
                style={{
                  ...animationStyle(card.id),
                  borderColor: card.customColor || '#3b82f660',
                  cursor: triggerable(card.id) ? 'pointer' : undefined,
                }}
              >
                <span className="text-sm font-bold text-amber-400">{card.title}</span>
                <p className="text-xs md:text-sm text-slate-300 leading-relaxed">{card.description}</p>
              </div>
            ))}
          </div>
        )}

        {slide.layout === 'bullet-list' && slide.bulletPoints && (
          <ul className="space-y-4 w-full max-w-2xl text-left">
            {slide.bulletPoints.map((pt, i) => (
              <li key={i} className="flex items-start space-x-3 text-base md:text-lg" style={{ color: design.bodyColor }}>
                <span className="w-2 h-2 rounded-full bg-amber-400 mt-2.5 shrink-0" />
                <span>{pt}</span>
              </li>
            ))}
          </ul>
        )}

        {slide.layout === 'chart' && (
          <div className="w-full max-w-2xl">
            {embeddedObjects.map((obj, idx) => {
              if (obj.type === 'WorkspaceReference') {
                const snap = obj.data.cached_snapshot;
                if (snap && snap.type === 'Chart') return <ChartRenderer key={idx} chart={snap.data} height={260} />;
                if (tableFromWorkspaceReference(obj)) return <GridLiveReferenceCard key={idx} object={obj} />;
                return null;
              }
              if (obj.type === 'Chart') return <ChartRenderer key={idx} chart={obj.data} height={260} />;
              return null;
            })}
          </div>
        )}
      </div>

      {sortPresentLayers(sceneObjects).filter((object) => !object.hidden).map((object) => {
        const paragraphs = object.kind === 'text' ? object.text.split('\n') : [];
        const isTrigger = triggerable(object.id);
        return (
          <div
            key={object.id}
            className={`absolute ${isTrigger ? 'pointer-events-auto cursor-pointer' : 'pointer-events-none'}`}
            onClick={(event) => trigger(event, object.id)}
            // GAP-0052, Runde 285: ein Trigger-Objekt war nur mit der Maus
            // ausloesbar. `role` und `tabIndex` NUR wenn es ein Trigger ist —
            // ein nicht ausloesbares Objekt soll nicht in der Tab-Reihenfolge
            // liegen.
            role={isTrigger ? 'button' : undefined}
            tabIndex={isTrigger ? 0 : undefined}
            onKeyDown={(event) => {
              if (!isTrigger) return;
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                trigger(event, object.id);
              }
            }}
            style={{
              left: `${object.xPercent}%`,
              top: `${object.yPercent}%`,
              width: `${object.widthPercent}%`,
              height: `${object.heightPercent}%`,
              opacity: object.opacity ?? 1,
              zIndex: object.zIndex ?? 20,
              transform: `rotate(${object.rotation ?? 0}deg)`,
            }}
          >
            <div className="w-full h-full" style={animationStyle(object.id)}>
              {object.kind === 'text' && (
                <div
                  className="w-full h-full whitespace-pre-wrap overflow-hidden p-2"
                  style={{
                    color: object.color,
                    fontSize: `${Math.max(8, object.fontSizePt)}pt`,
                    fontWeight: object.fontWeight === 'bold' ? 700 : object.fontWeight === 'semibold' ? 600 : 400,
                    textAlign: object.textAlign || 'left',
                    backgroundColor: object.backgroundColor || 'transparent',
                  }}
                >
                  {paragraphs.map((paragraph, paragraphIndex) => (
                    <React.Fragment key={`${object.id}-paragraph-${paragraphIndex}`}>
                      <span style={scopeStyle(object.id, 'paragraph', paragraphIndex)}>{paragraph || '\u00a0'}</span>
                      {paragraphIndex < paragraphs.length - 1 && <br />}
                    </React.Fragment>
                  ))}
                </div>
              )}
              {object.kind === 'shape' && (
                <div
                  className="w-full h-full"
                  style={{
                    backgroundColor: object.fillColor,
                    border: `${object.strokeWidth}px solid ${object.strokeColor}`,
                    borderRadius: object.shape === 'ellipse' ? '9999px' : object.shape === 'rounded-rectangle' ? '18px' : '0',
                  }}
                />
              )}
              {object.kind === 'widget' && <PresentWidgetRenderer widget={object} />}
              {object.kind === 'chart' && (
                <div className="w-full h-full rounded-xl border border-white/10 bg-slate-950/80 p-2 overflow-hidden">
                  <ChartRenderer
                    chart={projectAnimatedChart(object.chart, animations, object.id, animationProgressById)}
                    height={220}
                  />
                </div>
              )}
              {object.kind === 'table' && (
                <div className="w-full h-full rounded-xl border border-white/15 overflow-hidden bg-slate-950/95 shadow-lg">
                  <table className="w-full text-[0.625rem] border-collapse" style={{ color: object.textColor }}>
                    <thead>
                      <tr>
                        {object.columns.map((column, columnIndex) => (
                          <th
                            key={columnIndex}
                            className="border border-white/10 p-1.5 font-bold"
                            style={{ backgroundColor: object.headerColor, ...scopeStyle(object.id, 'category', columnIndex) }}
                          >
                            {column}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {object.rows.map((row, rowIndex) => (
                        <tr key={rowIndex} style={scopeStyle(object.id, 'series', rowIndex)}>
                          {object.columns.map((_, columnIndex) => (
                            <td
                              key={columnIndex}
                              className="border border-white/10 p-1 text-center"
                              style={{ backgroundColor: object.bodyColor, ...scopeStyle(object.id, 'category', columnIndex) }}
                            >
                              {row[columnIndex] || ''}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {object.kind === 'diagram' && <PresentDiagramRenderer diagram={object} />}
              {object.kind === 'code' && <PresentCodeRenderer codeObject={object} />}
              {object.kind === 'workspace' && <PresentWorkspaceSnapshotView object={object} />}
            </div>
          </div>
        );
      })}

      {(slide.images || []).filter((image) => !image.hidden).map((raw) => {
        const img = normalizePresentImage(raw);
        const isTrigger = triggerable(img.id);
        return (
          <div
            key={img.id}
            className={`absolute ${isTrigger ? 'pointer-events-auto cursor-pointer' : 'pointer-events-none'}`}
            onClick={(event) => trigger(event, img.id)}
            // GAP-0052, Runde 285: dieselbe Luecke wie beim Textobjekt
            // darueber — ein Bild-Trigger war nur mit der Maus ausloesbar.
            role={isTrigger ? 'button' : undefined}
            tabIndex={isTrigger ? 0 : undefined}
            onKeyDown={(event) => {
              if (!isTrigger) return;
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                trigger(event, img.id);
              }
            }}
            style={{
              left: `${img.xPercent}%`,
              top: `${img.yPercent}%`,
              width: `${img.widthPercent}%`,
              height: `${img.heightPercent}%`,
              zIndex: img.zIndex ?? 25,
            }}
          >
            <img
              src={img.dataUrl}
              alt={img.name}
              className="w-full h-full object-contain rounded-lg shadow-xl"
              style={animationStyle(img.id)}
            />
          </div>
        );
      })}

      {inkStrokes.length > 0 && (
        <svg className="absolute inset-0 w-full h-full pointer-events-none z-30" viewBox="0 0 100 100" preserveAspectRatio="none">
          {inkStrokes.map((stroke) => {
            if (stroke.points.length < 2) return null;
            const d = stroke.points.reduce((acc, point, index) => `${acc} ${index === 0 ? 'M' : 'L'} ${point.xPercent} ${point.yPercent}`, '');
            return <path key={stroke.id} d={d} stroke={stroke.color} strokeWidth={stroke.width / 10} strokeOpacity={stroke.opacity} fill="none" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />;
          })}
        </svg>
      )}

      {laserActive && laserPos && (
        <div
          className="absolute w-4 h-4 rounded-full bg-red-500 shadow-[0_0_15px_#ff0000] pointer-events-none z-50 -translate-x-1/2 -translate-y-1/2 animate-ping"
          style={{ left: `${laserPos.xPercent}%`, top: `${laserPos.yPercent}%` }}
        />
      )}

      {design.showFooter && (
        <div className="relative z-10 flex items-center justify-between pt-4 border-t border-white/10 text-xs font-mono" style={{ color: design.bodyColor }}>
          <span>{design.footerText}</span>
          <span>Slide {currentIdx + 1} of {totalSlides}</span>
        </div>
      )}
    </div>
  );
};
