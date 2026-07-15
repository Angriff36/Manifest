import { describe, it, expect } from 'vitest';
import {
  nameKey,
  pickBestSpelling,
  canonicalEntityName,
  canonicalFieldName,
  relationshipIdField,
  canonicalTableName,
  isMechanicalIdAlias,
  CanonicalNameRegistry,
} from './canonical-names.js';

describe('canonical-names', () => {
  it('folds casing and separators to one identity key', () => {
    const keys = ['eventdate', 'EventDate', 'EVENTDATE', 'event_date', 'event-date'].map(nameKey);
    expect(new Set(keys).size).toBe(1);
    expect(keys[0]).toBe('eventdate');
  });

  it('prefers word-boundary spellings over flat ALLCAPS', () => {
    expect(pickBestSpelling(['EVENTDATE', 'EventDate', 'eventdate'])).toBe('EventDate');
    expect(canonicalEntityName('eventdate', ['EVENTDATE', 'EventDate', 'eventdate'])).toBe(
      'EventDate',
    );
  });

  it('produces house forms for entity / field / table / id', () => {
    expect(canonicalEntityName('catering_event')).toBe('CateringEvent');
    expect(canonicalFieldName('EVENT_DATE')).toBe('eventDate');
    expect(canonicalTableName('CateringEvent')).toBe('cateringEvents');
    expect(relationshipIdField('author')).toBe('authorId');
    expect(relationshipIdField('AuthorID')).toBe('authorId');
  });

  it('treats mechanical id aliases as the same FK', () => {
    expect(isMechanicalIdAlias('author', 'authorid')).toBe(true);
    expect(isMechanicalIdAlias('author', 'AuthorID')).toBe(true);
    expect(isMechanicalIdAlias('author', 'AUTHOR_ID')).toBe(true);
    expect(isMechanicalIdAlias('author', 'writerId')).toBe(false);
  });

  it('registry lets a well-cased entity win across aliases', () => {
    const reg = new CanonicalNameRegistry();
    reg.addEntity('eventdate');
    reg.addEntity('EventDate');
    expect(reg.entity('EVENTDATE')).toBe('EventDate');
    expect(reg.entity('event_date')).toBe('EventDate');
  });
});
