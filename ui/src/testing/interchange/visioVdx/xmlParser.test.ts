import { describe, expect, it } from 'vitest';
import { MAX_VISIO_XML_BYTES, parseVisioXml, VisioXmlParseError } from '../../../shared/interchange/visioVdx/xmlParser';

const VDX_NS = 'http://schemas.microsoft.com/visio/2003/core';

describe('bounded Visio XML parser', () => {
  it('parses namespace-qualified elements and preserves mixed text order', () => {
    const root = parseVisioXml(
      '<?xml version="1.0" encoding="UTF-8"?>'
      + `<v:VisioDocument xmlns:v="${VDX_NS}"><v:Pages><v:Page ID="0"><v:Shapes>`
      + '<v:Shape ID="shape-1"><v:Text>A&amp;B <![CDATA[<C>]]> &lt;D&gt;</v:Text></v:Shape>'
      + '</v:Shapes></v:Page></v:Pages></v:VisioDocument>',
    );
    const pages = root.content.find((node) => typeof node !== 'string' && node.localName === 'Pages');
    const page = pages && typeof pages !== 'string' ? pages.content.find((node) => typeof node !== 'string' && node.localName === 'Page') : undefined;
    const shapes = page && typeof page !== 'string' ? page.content.find((node) => typeof node !== 'string' && node.localName === 'Shapes') : undefined;
    const shape = shapes && typeof shapes !== 'string' ? shapes.content.find((node) => typeof node !== 'string' && node.localName === 'Shape') : undefined;
    const text = shape && typeof shape !== 'string' ? shape.content.find((node) => typeof node !== 'string' && node.localName === 'Text') : undefined;

    expect(root.localName).toBe('VisioDocument');
    expect(shape && typeof shape !== 'string' ? shape.attributes.get('ID') : undefined).toBe('shape-1');
    expect(text && typeof text !== 'string' ? text.content.join('') : undefined).toBe('A&B <C> <D>');
  });

  it('rejects DTDs, custom entities, and entity expansion payloads', () => {
    expect(() => parseVisioXml(`<!DOCTYPE x [<!ENTITY e "boom">]><VisioDocument xmlns="${VDX_NS}"/>`)).toThrow(VisioXmlParseError);
    expect(() => parseVisioXml(`<VisioDocument xmlns="${VDX_NS}">&custom;</VisioDocument>`)).toThrow(/entity-unsupported/u);
    expect(() => parseVisioXml(`<VisioDocument xmlns="${VDX_NS}">&#1;</VisioDocument>`)).toThrow(/character-invalid/u);
    expect(() => parseVisioXml(`<?xml version="1.0" encoding="UTF-16"?><VisioDocument xmlns="${VDX_NS}"/>`)).toThrow(/xml-declaration-unsupported/u);
    expect(parseVisioXml(`<?xml version="1.0" encoding="utf-8"?><VisioDocument xmlns="${VDX_NS}"/>`).namespaceUri).toBe(VDX_NS);
  });

  it('rejects malformed nesting, multiple roots, duplicate attributes, and bare ampersands', () => {
    expect(() => parseVisioXml(`<VisioDocument xmlns="${VDX_NS}"><Page></VisioDocument>`)).toThrow(/closing-tag-mismatch/u);
    expect(() => parseVisioXml(`<VisioDocument xmlns="${VDX_NS}"/><VisioDocument xmlns="${VDX_NS}"/>`)).toThrow(/multiple-roots/u);
    expect(() => parseVisioXml(`<VisioDocument xmlns="${VDX_NS}" a="1" a="2"/>`)).toThrow(/attribute-duplicate/u);
    expect(() => parseVisioXml(`<VisioDocument xmlns="${VDX_NS}">one & two</VisioDocument>`)).toThrow(/entity-invalid/u);
    expect(() => parseVisioXml(`<OtherDocument xmlns="${VDX_NS}"/>`)).toThrow(/root-not-visio-document/u);
    expect(() => parseVisioXml('<VisioDocument xmlns="urn:not-vdx"/>')).toThrow(/namespace-unsupported/u);
    expect(() => parseVisioXml('<v:VisioDocument/>')).toThrow(/namespace-prefix-unbound/u);
  });

  it('bounds element count and nesting depth before returning a tree', () => {
    const overElementLimit = `<VisioDocument xmlns="${VDX_NS}"><n>${'<n/>'.repeat(350_000)}</n></VisioDocument>`;
    expect(() => parseVisioXml(overElementLimit)).toThrow(/element-limit/u);

    const overDepthLimit = `<VisioDocument xmlns="${VDX_NS}">${'<n>'.repeat(96)}${'</n>'.repeat(96)}</VisioDocument>`;
    expect(() => parseVisioXml(overDepthLimit)).toThrow(/depth-limit/u);
  });

  it('rejects oversized XML before allocating its syntax tree', () => {
    const oversized = `<VisioDocument xmlns="${VDX_NS}"/>${' '.repeat(MAX_VISIO_XML_BYTES)}`;
    expect(() => parseVisioXml(oversized)).toThrow(/byte-limit/u);
  });
});
