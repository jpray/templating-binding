/*eslint dot-notation:0*/
import {
  Parser,
  ObserverLocator,
  EventManager,
  ListenerExpression,
  BindingExpression,
  CallExpression,
  bindingMode
} from 'aurelia-binding';

import {BehaviorInstruction} from 'aurelia-templating';
import * as LogManager from 'aurelia-logging';

export class SyntaxInterpreter {
  static inject() { return [Parser, ObserverLocator, EventManager]; }
  constructor(parser, observerLocator, eventManager) {
    this.parser = parser;
    this.observerLocator = observerLocator;
    this.eventManager = eventManager;
  }

  interpret(resources, element, info, existingInstruction, context) {
    if (info.command in this) {
      return this[info.command](resources, element, info, existingInstruction, context);
    }

    return this.handleUnknownCommand(resources, element, info, existingInstruction, context);
  }

  handleUnknownCommand(resources, element, info, existingInstruction, context) {
    LogManager.getLogger('templating-binding').warn('Unknown binding command.', info);
    return existingInstruction;
  }

  determineDefaultBindingMode(element, attrName, context) {
    let tagName = element.tagName.toLowerCase();

    if (tagName === 'input' && (attrName === 'value' || attrName === 'checked' || attrName === 'files')
      || (tagName === 'textarea' || tagName === 'select') && attrName === 'value'
      || (attrName === 'textcontent' || attrName === 'innerhtml') && element.contentEditable === 'true'
      || attrName === 'scrolltop'
      || attrName === 'scrollleft') {
      return bindingMode.twoWay;
    }

    if (context && attrName in context.attributes) {
      return context.attributes[attrName].defaultBindingMode || bindingMode.oneWay;
    }

    return bindingMode.oneWay;
  }

  bind(resources, element, info, existingInstruction, context) {
    let instruction = existingInstruction || BehaviorInstruction.attribute(info.attrName);

    instruction.attributes[info.attrName] = new BindingExpression(
      this.observerLocator,
      this.attributeMap[info.attrName] || info.attrName,
      this.parser.parse(info.attrValue),
      info.defaultBindingMode || this.determineDefaultBindingMode(element, info.attrName, context),
      resources.lookupFunctions
    );

    return instruction;
  }

  trigger(resources, element, info) {
    return new ListenerExpression(
      this.eventManager,
      info.attrName,
      this.parser.parse(info.attrValue),
      false,
      true,
      resources.lookupFunctions
    );
  }

  delegate(resources, element, info) {
    return new ListenerExpression(
      this.eventManager,
      info.attrName,
      this.parser.parse(info.attrValue),
      true,
      true,
      resources.lookupFunctions
    );
  }

  call(resources, element, info, existingInstruction) {
    let instruction = existingInstruction || BehaviorInstruction.attribute(info.attrName);

    instruction.attributes[info.attrName] = new CallExpression(
      this.observerLocator,
      info.attrName,
      this.parser.parse(info.attrValue),
      resources.lookupFunctions
    );

    return instruction;
  }

  options(resources, element, info, existingInstruction, context) {
    let instruction = existingInstruction || BehaviorInstruction.attribute(info.attrName);
    let attrValue = info.attrValue;
    let language = this.language;
    let name = null;
    let target = '';
    let current;
    let i;
    let ii;
    let inString = false;
    let inEscape = false;

    for (i = 0, ii = attrValue.length; i < ii; ++i) {
      current = attrValue[i];

      if (current === ';' && !inString) {
        info = language.inspectAttribute(resources, name, target.trim());
        language.createAttributeInstruction(resources, element, info, instruction, context);

        if (!instruction.attributes[info.attrName]) {
          instruction.attributes[info.attrName] = info.attrValue;
        }

        target = '';
        name = null;
      } else if (current === ':' && name === null) {
        name = target.trim();
        target = '';
      } else if (current === '\\') {
        target += current;
        inEscape = true;
        continue;
      } else {
        target += current;

        if (name !== null && inEscape === false && current === '\'') {
          inString = !inString;
        }
      }

      inEscape = false;
    }

    if (name !== null) {
      info = language.inspectAttribute(resources, name, target.trim());
      language.createAttributeInstruction(resources, element, info, instruction, context);

      if (!instruction.attributes[info.attrName]) {
        instruction.attributes[info.attrName] = info.attrValue;
      }
    }

    return instruction;
  }

  'for'(resources, element, info, existingInstruction) {
    let parts;
    let keyValue;
    let instruction;
    let attrValue;
    let isDestructuring;

    attrValue = info.attrValue;
    isDestructuring = attrValue.match(/^ *[[].+[\]]/);
    parts = isDestructuring ? attrValue.split('of ') : attrValue.split(' of ');

    if (parts.length !== 2) {
      throw new Error('Incorrect syntax for "for". The form is: "$local of $items" or "[$key, $value] of $items".');
    }

    instruction = existingInstruction || BehaviorInstruction.attribute(info.attrName);

    if (isDestructuring) {
      keyValue = parts[0].replace(/[[\]]/g, '').replace(/,/g, ' ').replace(/\s+/g, ' ').trim().split(' ');
      instruction.attributes.key = keyValue[0];
      instruction.attributes.value = keyValue[1];
    } else {
      instruction.attributes.local = parts[0];
    }

    instruction.attributes.items = new BindingExpression(
      this.observerLocator,
      'items',
      this.parser.parse(parts[1]),
      bindingMode.oneWay,
      resources.lookupFunctions
    );

    return instruction;
  }

  'two-way'(resources, element, info, existingInstruction) {
    let instruction = existingInstruction || BehaviorInstruction.attribute(info.attrName);

    instruction.attributes[info.attrName] = new BindingExpression(
        this.observerLocator,
        this.attributeMap[info.attrName] || info.attrName,
        this.parser.parse(info.attrValue),
        bindingMode.twoWay,
        resources.lookupFunctions
      );

    return instruction;
  }

  'one-way'(resources, element, info, existingInstruction) {
    let instruction = existingInstruction || BehaviorInstruction.attribute(info.attrName);

    instruction.attributes[info.attrName] = new BindingExpression(
      this.observerLocator,
      this.attributeMap[info.attrName] || info.attrName,
      this.parser.parse(info.attrValue),
      bindingMode.oneWay,
      resources.lookupFunctions
    );

    return instruction;
  }

  'one-time'(resources, element, info, existingInstruction) {
    let instruction = existingInstruction || BehaviorInstruction.attribute(info.attrName);

    instruction.attributes[info.attrName] = new BindingExpression(
      this.observerLocator,
      this.attributeMap[info.attrName] || info.attrName,
      this.parser.parse(info.attrValue),
      bindingMode.oneTime,
      resources.lookupFunctions
    );

    return instruction;
  }
}
