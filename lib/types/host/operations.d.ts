import type { EditDependencies, Operate } from './types.js';
export declare function createOperations(deps: EditDependencies): {
    operate: Operate;
    dispose(): void;
};
