// STATUS: DIAMANT VGT SUPREME — Tasks/Projects schedule dependency projection
import type { ProjectDependency } from '../../../shared/contracts/workspace';

export function taskScheduleDependencies(taskId: string, dependencies: ProjectDependency[]): ProjectDependency[] {
  return dependencies.filter((dependency) => dependency.predecessorTaskId === taskId || dependency.successorTaskId === taskId);
}

export function dependencyPeerTaskId(taskId: string, dependency: ProjectDependency): string | undefined {
  if (dependency.predecessorTaskId === taskId) return dependency.successorTaskId;
  if (dependency.successorTaskId === taskId) return dependency.predecessorTaskId;
  return undefined;
}
