import { Container } from '@pmndrs/uikit';
export declare class SystemUI extends Container {
    name: string;
    canvas: Container;
    private systemBar;
    constructor(sizeX?: number, sizeY?: number | null, containerHeight?: number | null);
}
