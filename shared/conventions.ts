export interface PropertyConvention {
  id: string;
  pattern: string;
  property: FigmaNodeProperty;
  nodeTypes: NodeType[];
  variableType: VariableResolvedDataType;
  description?: string;
}

export type FigmaNodeProperty =
  | 'paddingLeft'
  | 'paddingRight'
  | 'paddingTop'
  | 'paddingBottom'
  | 'itemSpacing'
  | 'cornerRadius'
  | 'topLeftRadius'
  | 'topRightRadius'
  | 'bottomLeftRadius'
  | 'bottomRightRadius'
  | 'fills[0].color'
  | 'strokes[0].color'
  | 'strokeWeight'
  | 'opacity'
  | 'width'
  | 'height'
  | 'characters'
  | string;
