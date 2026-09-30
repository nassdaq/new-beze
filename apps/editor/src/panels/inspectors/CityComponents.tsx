import type { Component, GameVariable, Operation } from '@beze/project-schema';
import { newId } from '@beze/project-core';
import { useEditor, useProject } from '../../store/editorStore.js';
import { defaultCondition, replaceAt } from '../../ui/actions.js';
import { isNumberVariable } from '../../ui/economy.js';
import { Field } from '../../ui/Field.js';
import { ConditionEditor, VariablePicker } from '../../ui/ValueEditors.js';
import { identifierFrom, pickVariable, uniqueVariableName } from '../../ui/variables.js';
import { toast } from '../../ui/Toast.js';

type Of<T extends Component['type']> = Extract<Component, { type: T }>;
const MARKER_ICONS = ['shop', 'bank', 'food', 'bus', 'home', 'park', 'mission', 'market', 'place'] as const;

/** v3 city components: property, shop, pickup, lock and map marker. */
export function CityComponents({ sceneId, entityId }: { sceneId: string; entityId: string }) {
  const project = useProject();
  const dispatch = useEditor((s) => s.dispatch);
  const entity = project?.scenes[sceneId]?.entities[entityId];
  if (!project || !entity) return null;
  const find = <T extends Component['type']>(type: T) => entity.components.find((c): c is Of<T> => c.type === type);
  const property = find('property');
  const shop = find('shop');
  const pickup = find('pickup');
  const lock = find('lock');
  const marker = find('mapMarker');
  const hasEconomy = !!project.settings.economy;
  const numberVar = pickVariable(project.variables, 'number');
  const anyVar = Object.values(project.variables)[0];

  const run = (label: string, ops: Operation[]) => {
    const r = dispatch(label, ops);
    if (!r.ok) toast.error('Change rejected', r.errors.map((e) => e.message));
  };
  const set = (label: string, component: Component) => run(label, [{ op: 'setComponent', sceneId, entityId, component }]);
  const remove = (label: string, componentType: Component['type']) => run(label, [{ op: 'removeComponent', sceneId, entityId, componentType }]);
  const int = (raw: string, min = 0) => Math.max(min, Math.round(Number(raw)) || 0);

  /** A property needs its own "owned" flag; make one named after the entity in the same batch. */
  const addProperty = () => {
    const variable: GameVariable = { id: newId('var'), name: uniqueVariableName(project.variables, `owns_${identifierFrom(entity.name, 'place')}`), type: 'boolean', initial: false, label: `Owns ${entity.name}`, category: 'flag' };
    run('Make property', [
      { op: 'createVariable', variable },
      { op: 'setComponent', sceneId, entityId, component: { type: 'property', name: entity.name, price: 250000, incomePerDay: 8000, ownedVariableId: variable.id } },
    ]);
  };

  const economyHint = !hasEconomy && <p className="muted small">Needs the Economy setting (Project section) to be on.</p>;
  const line = (list: Array<{ variableId: string; price: number }>, i: number, next: { variableId: string; price: number } | null) => replaceAt(list, i, next);

  return (
    <>
      <label className="check"><input type="checkbox" checked={!!property} data-testid="entity-property" onChange={(e) => (e.target.checked ? addProperty() : remove('Not a property', 'property'))} /> Property (buy it, earn daily income)</label>
      {property && (
        <div className="component-body" data-testid="property-fields">
          {economyHint}
          <Field label="Property name"><input value={property.name} maxLength={120} onChange={(e) => set('Property name', { ...property, name: e.target.value || property.name })} /></Field>
          <div className="field-row">
            <Field label="Price"><input type="number" min={0} value={property.price} data-testid="property-price" onChange={(e) => set('Property price', { ...property, price: int(e.target.value) })} /></Field>
            <Field label="Income / day"><input type="number" min={0} value={property.incomePerDay} data-testid="property-income" onChange={(e) => set('Property income', { ...property, incomePerDay: int(e.target.value) })} /></Field>
          </div>
          <Field label="Owned flag (boolean variable)"><VariablePicker value={property.ownedVariableId} filter={(v) => v.type === 'boolean'} testId="property-owned" onChange={(id) => id && set('Owned flag', { ...property, ownedVariableId: id })} /></Field>
          <Field label="Description"><input value={property.description ?? ''} maxLength={200} onChange={(e) => { const { description: _d, ...rest } = property; set('Property description', e.target.value ? { ...rest, description: e.target.value } : rest); }} /></Field>
        </div>
      )}

      <label className="check"><input type="checkbox" checked={!!shop} data-testid="entity-shop" onChange={(e) => (e.target.checked ? set('Make shop', { type: 'shop', name: entity.name, sells: [], buys: [] }) : remove('Not a shop', 'shop'))} /> Shop (buy and sell items)</label>
      {shop && (
        <div className="component-body" data-testid="shop-fields">
          {economyHint}
          <Field label="Shop name"><input value={shop.name} maxLength={120} onChange={(e) => set('Shop name', { ...shop, name: e.target.value || shop.name })} /></Field>
          {(['sells', 'buys'] as const).map((side) => (
            <div key={side} className="shop-side">
              <span className="field-label">{side === 'sells' ? 'Sells (item · price)' : 'Buys (item · price)'}</span>
              {shop[side].map((row, i) => (
                <div key={i} className="shop-line">
                  <VariablePicker value={row.variableId} filter={isNumberVariable} onChange={(id) => id && set(`Shop ${side}`, { ...shop, [side]: line(shop[side], i, { ...row, variableId: id }) })} />
                  <input type="number" min={0} className="num" value={row.price} aria-label="Price" onChange={(e) => set(`Shop ${side}`, { ...shop, [side]: line(shop[side], i, { ...row, price: int(e.target.value) }) })} />
                  <button type="button" className="small" title="Remove" onClick={() => set(`Shop ${side}`, { ...shop, [side]: line(shop[side], i, null) })}>×</button>
                </div>
              ))}
              {shop[side].length < 24 && <button type="button" className="small" disabled={!numberVar} title={numberVar ? '' : 'Create a number variable for the item first'} data-testid={`shop-add-${side}`} onClick={() => numberVar && set(`Shop ${side}`, { ...shop, [side]: [...shop[side], { variableId: numberVar.id, price: side === 'sells' ? 1000 : 500 }] })}>+ {side === 'sells' ? 'Sells' : 'Buys'}</button>}
            </div>
          ))}
        </div>
      )}

      <label className="check" title={numberVar ? '' : 'Create a number variable first'}><input type="checkbox" checked={!!pickup} disabled={!pickup && !numberVar} data-testid="entity-pickup" onChange={(e) => (e.target.checked && numberVar ? set('Make pickup', { type: 'pickup', variableId: numberVar.id, amount: 1, once: true }) : remove('Not a pickup', 'pickup'))} /> Pickup (walk over to collect)</label>
      {pickup && (
        <div className="component-body" data-testid="pickup-fields">
          <Field label="Adds to variable"><VariablePicker value={pickup.variableId} filter={isNumberVariable} onChange={(id) => id && set('Pickup variable', { ...pickup, variableId: id })} /></Field>
          <div className="field-row">
            <Field label="Amount"><input type="number" value={pickup.amount} onChange={(e) => set('Pickup amount', { ...pickup, amount: Number(e.target.value) || 0 })} /></Field>
            <label className="check"><input type="checkbox" checked={pickup.once} onChange={(e) => set('Pickup once', { ...pickup, once: e.target.checked })} /> Only once</label>
          </div>
        </div>
      )}

      <label className="check" title={anyVar ? '' : 'Create a variable first'}><input type="checkbox" checked={!!lock} disabled={!lock && !anyVar} data-testid="entity-lock" onChange={(e) => (e.target.checked && anyVar ? set('Make lock', { type: 'lock', condition: defaultCondition(anyVar), lockedText: 'This area is locked.' }) : remove('Unlock', 'lock'))} /> Locked until a condition holds</label>
      {lock && (
        <div className="component-body" data-testid="lock-fields">
          <span className="field-label">Unlocks when</span>
          <div className="node-body row"><ConditionEditor value={lock.condition} onChange={(condition) => set('Lock condition', { ...lock, condition })} /></div>
          <Field label="Locked message"><input value={lock.lockedText} maxLength={200} onChange={(e) => set('Locked text', { ...lock, lockedText: e.target.value })} /></Field>
        </div>
      )}

      <label className="check"><input type="checkbox" checked={!!marker} data-testid="entity-map-marker" onChange={(e) => (e.target.checked ? set('Map marker', { type: 'mapMarker', label: entity.name, icon: 'place' }) : remove('No map marker', 'mapMarker'))} /> Map marker (shows on the map, discoverable)</label>
      {marker && (
        <div className="component-body" data-testid="map-marker-fields">
          <Field label="Label"><input value={marker.label} maxLength={120} onChange={(e) => set('Marker label', { ...marker, label: e.target.value || marker.label })} /></Field>
          <div className="field-row">
            <Field label="Icon">
              <select value={marker.icon ?? ''} onChange={(e) => { const { icon: _i, ...rest } = marker; set('Marker icon', e.target.value ? { ...rest, icon: e.target.value as (typeof MARKER_ICONS)[number] } : rest); }}>
                <option value="">(none)</option>
                {MARKER_ICONS.map((i) => <option key={i} value={i}>{i}</option>)}
              </select>
            </Field>
            <Field label="Discover XP"><input type="number" min={0} value={marker.discoverXp ?? 0} onChange={(e) => { const { discoverXp: _x, ...rest } = marker; const xp = int(e.target.value); set('Discover XP', xp > 0 ? { ...rest, discoverXp: xp } : rest); }} /></Field>
          </div>
        </div>
      )}
    </>
  );
}
