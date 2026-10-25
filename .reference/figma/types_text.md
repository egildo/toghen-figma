# Source: https://developers.figma.com/docs/plugins/api/FontName/

<!-- Vendored snapshot of the Figma Plugin API docs. Captured 2026-08-04. -->

**Sources in this file** (captured 2026-08-04):

- <https://developers.figma.com/docs/plugins/api/FontName/>
- <https://developers.figma.com/docs/plugins/api/LineHeight/>
- <https://developers.figma.com/docs/plugins/api/LetterSpacing/>
- <https://developers.figma.com/docs/plugins/api/TextCase/>
- <https://developers.figma.com/docs/plugins/api/TextDecoration/>
- <https://developers.figma.com/docs/plugins/api/TextDecorationStyle/>
- <https://developers.figma.com/docs/plugins/api/TextDecorationOffset/>
- <https://developers.figma.com/docs/plugins/api/TextDecorationThickness/>
- <https://developers.figma.com/docs/plugins/api/LeadingTrim/>
- <https://developers.figma.com/docs/plugins/api/OpenTypeFeature/>
- <https://developers.figma.com/docs/plugins/api/TextListOptions/>

---
# FontName

``` ts
interface Font {
  fontName: FontName
}

interface FontName {
  readonly family: string
  readonly style: string
}
```

Describes a font used by a text node. For example, the default font is `{ family: "Inter", style: "Regular" }`.

---

> Source: <https://developers.figma.com/docs/plugins/api/LineHeight/>

# LineHeight

``` ts
type LineHeight = {
  readonly value: number
  readonly unit: "PIXELS" | "PERCENT"
} | {
  readonly unit: "AUTO"
}
```

An object representing a number with a unit. This is similar to how you can set either `100%` or `100px` in a lot of CSS properties. It can also be set to `AUTO`.

---

> Source: <https://developers.figma.com/docs/plugins/api/LetterSpacing/>

# LetterSpacing

``` ts
type LetterSpacing = {
  readonly value: number
  readonly unit: "PIXELS" | "PERCENT"
}
```

An object representing a number with a unit. This is similar to how you can set either `100%` or `100px` in a lot of CSS properties.

---

> Source: <https://developers.figma.com/docs/plugins/api/TextCase/>

# TextCase

``` ts
type TextCase = "ORIGINAL" | "UPPER" | "LOWER" | "TITLE" | "SMALL_CAPS" | "SMALL_CAPS_FORCED"
```

The possible values are:

- `"ORIGINAL"`: show the text as defined, no overrides.
- `"UPPER"`: all characters are in upper case.
- `"LOWER"`: all characters are in lower case.
- `"TITLE"`: the first character of each word is upper case and all other characters are in lower case.
- `"SMALL_CAPS"`: all characters are in small upper case.
- `"SMALL_CAPS_FORCED"`: the first character of each word is upper case and all other characters are in small upper case.

---

> Source: <https://developers.figma.com/docs/plugins/api/TextDecoration/>

# TextDecoration

``` ts
type TextDecoration = "NONE" | "UNDERLINE" | "STRIKETHROUGH"
```

The possible values are:

- `"NONE"`: the text is shown without decorations.
- `"UNDERLINE"`: the text has a horizontal line underneath it.
- `"STRIKETHROUGH"`: the text has a horizontal line crossing it in the middle.

---

> Source: <https://developers.figma.com/docs/plugins/api/TextDecorationStyle/>

# TextDecorationStyle

``` ts
type TextDecorationStyle = "SOLID" | "WAVY" | "DOTTED"
```

---

> Source: <https://developers.figma.com/docs/plugins/api/TextDecorationOffset/>

# TextDecorationOffset

``` ts
type TextDecorationOffset =
  | {
      readonly value: number
      readonly unit: 'PIXELS' | 'PERCENT'
    }
  | {
      readonly unit: 'AUTO'
    }
```

---

> Source: <https://developers.figma.com/docs/plugins/api/TextDecorationThickness/>

# TextDecorationThickness

``` ts
type TextDecorationThickness =
  | {
      readonly value: number
      readonly unit: 'PIXELS' | 'PERCENT'
    }
  | {
      readonly unit: 'AUTO'
    }
```

---

> Source: <https://developers.figma.com/docs/plugins/api/LeadingTrim/>

# LeadingTrim

``` ts
type LineHeight = {
  type: 'CAP_HEIGHT' | 'NONE'
}
```

An object representing the removal of vertical space above and below text glyphs.

---

> Source: <https://developers.figma.com/docs/plugins/api/OpenTypeFeature/>

# OpenTypeFeature

Defines all the possible keys in the map of OpenType features from the [openTypeFeatures](https://developers.figma.com/docs/plugins/api/properties/TextNode-opentypefeatures/) property.

``` ts
type OpenTypeFeature =
  | 'PCAP'
  | 'C2PC'
  | 'CASE'
  | 'CPSP'
  | 'TITL'
  | 'UNIC'
  | 'ZERO'
  | 'SINF'
  | 'ORDN'
  | 'AFRC'
  | 'DNOM'
  | 'NUMR'
  | 'LIGA'
  | 'CLIG'
  | 'DLIG'
  | 'HLIG'
  | 'RLIG'
  | 'AALT'
  | 'CALT'
  | 'RCLT'
  | 'SALT'
  | 'RVRN'
  | 'VERT'
  | 'SWSH'
  | 'CSWH'
  | 'NALT'
  | 'CCMP'
  | 'STCH'
  | 'HIST'
  | 'SIZE'
  | 'ORNM'
  | 'ITAL'
  | 'RAND'
  | 'DTLS'
  | 'FLAC'
  | 'MGRK'
  | 'SSTY'
  | 'KERN'
  | 'FWID'
  | 'HWID'
  | 'HALT'
  | 'TWID'
  | 'QWID'
  | 'PWID'
  | 'JUST'
  | 'LFBD'
  | 'OPBD'
  | 'RTBD'
  | 'PALT'
  | 'PKNA'
  | 'LTRA'
  | 'LTRM'
  | 'RTLA'
  | 'RTLM'
  | 'ABRV'
  | 'ABVM'
  | 'ABVS'
  | 'VALT'
  | 'VHAL'
  | 'BLWF'
  | 'BLWM'
  | 'BLWS'
  | 'AKHN'
  | 'CJCT'
  | 'CFAR'
  | 'CPCT'
  | 'CURS'
  | 'DIST'
  | 'EXPT'
  | 'FALT'
  | 'FINA'
  | 'FIN2'
  | 'FIN3'
  | 'HALF'
  | 'HALN'
  | 'HKNA'
  | 'HNGL'
  | 'HOJO'
  | 'INIT'
  | 'ISOL'
  | 'JP78'
  | 'JP83'
  | 'JP90'
  | 'JP04'
  | 'LJMO'
  | 'LOCL'
  | 'MARK'
  | 'MEDI'
  | 'MED2'
  | 'MKMK'
  | 'NLCK'
  | 'NUKT'
  | 'PREF'
  | 'PRES'
  | 'VPAL'
  | 'PSTF'
  | 'PSTS'
  | 'RKRF'
  | 'RPHF'
  | 'RUBY'
  | 'SMPL'
  | 'TJMO'
  | 'TNAM'
  | 'TRAD'
  | 'VATU'
  | 'VJMO'
  | 'VKNA'
  | 'VKRN'
  | 'VRTR'
  | 'VRT2'
  | 'SS01'
  | 'SS02'
  | 'SS03'
  | 'SS04'
  | 'SS05'
  | 'SS06'
  | 'SS07'
  | 'SS08'
  | 'SS09'
  | 'SS10'
  | 'SS11'
  | 'SS12'
  | 'SS13'
  | 'SS14'
  | 'SS15'
  | 'SS16'
  | 'SS17'
  | 'SS18'
  | 'SS19'
  | 'SS20'
  | 'CV01'
  | 'CV02'
  | 'CV03'
  | 'CV04'
  | 'CV05'
  | 'CV06'
  | 'CV07'
  | 'CV08'
  | 'CV09'
  | 'CV10'
  | 'CV11'
  | 'CV12'
  | 'CV13'
  | 'CV14'
  | 'CV15'
  | 'CV16'
  | 'CV17'
  | 'CV18'
  | 'CV19'
  | 'CV20'
  | 'CV21'
  | 'CV22'
  | 'CV23'
  | 'CV24'
  | 'CV25'
  | 'CV26'
  | 'CV27'
  | 'CV28'
  | 'CV29'
  | 'CV30'
  | 'CV31'
  | 'CV32'
  | 'CV33'
  | 'CV34'
  | 'CV35'
  | 'CV36'
  | 'CV37'
  | 'CV38'
  | 'CV39'
  | 'CV40'
  | 'CV41'
  | 'CV42'
  | 'CV43'
  | 'CV44'
  | 'CV45'
  | 'CV46'
  | 'CV47'
  | 'CV48'
  | 'CV49'
  | 'CV50'
  | 'CV51'
  | 'CV52'
  | 'CV53'
  | 'CV54'
  | 'CV55'
  | 'CV56'
  | 'CV57'
  | 'CV58'
  | 'CV59'
  | 'CV60'
  | 'CV61'
  | 'CV62'
  | 'CV63'
  | 'CV64'
  | 'CV65'
  | 'CV66'
  | 'CV67'
  | 'CV68'
  | 'CV69'
  | 'CV70'
  | 'CV71'
  | 'CV72'
  | 'CV73'
  | 'CV74'
  | 'CV75'
  | 'CV76'
  | 'CV77'
  | 'CV78'
  | 'CV79'
  | 'CV80'
  | 'CV81'
  | 'CV82'
  | 'CV83'
  | 'CV84'
  | 'CV85'
  | 'CV86'
  | 'CV87'
  | 'CV88'
  | 'CV89'
  | 'CV90'
  | 'CV91'
  | 'CV92'
  | 'CV93'
  | 'CV94'
  | 'CV95'
  | 'CV96'
  | 'CV97'
  | 'CV98'
  | 'CV99'
```

---

> Source: <https://developers.figma.com/docs/plugins/api/TextListOptions/>

# TextListOptions

``` ts
type TextListOptions = {
    type: "ORDERED" | "UNORDERED" | "NONE"
}
```

An object describing list settings for a range of text. The possible values for `type` are:

- `"ORDERED"`: if the text range has been set to be part of an ordered list (ie: list with numerical counter).
- `"UNORDERED"`: if the text range has been set to be part of an unordered list (ie: bulleted list).
- `"NONE"`: if the text range is plain text and is not part of any list
