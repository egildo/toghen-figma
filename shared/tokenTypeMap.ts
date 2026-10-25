export interface TokenTypeRoute {
  target: 'variable' | 'style' | 'skip';
  variableType?: VariableResolvedDataType;
  styleType?: 'TEXT' | 'EFFECT' | 'PAINT';
}

export type TokenTypeConversionMap = Record<string, TokenTypeRoute>;

export const defaultTokenTypeMap: TokenTypeConversionMap = {
  color: { target: 'variable', variableType: 'COLOR' },
  dimension: { target: 'variable', variableType: 'FLOAT' },
  letterSpacing: { target: 'variable', variableType: 'FLOAT' },
  number: { target: 'variable', variableType: 'FLOAT' },
  fontFamily: { target: 'variable', variableType: 'STRING' },
  fontWeight: { target: 'variable', variableType: 'FLOAT' },
  string: { target: 'variable', variableType: 'STRING' },
  boolean: { target: 'variable', variableType: 'BOOLEAN' },
  typography: { target: 'style', styleType: 'TEXT' },
  shadow: { target: 'style', styleType: 'EFFECT' },
  gradient: { target: 'style', styleType: 'PAINT' },
};
