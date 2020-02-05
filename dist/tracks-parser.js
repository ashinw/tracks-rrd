/**

Tracks notation guide

[x]				    optional, normally omitted
[:x]			    optional, normally included
{x}				    one or more
{x y}		      one or more
[{x y}]			  zero or more, normally omitted
[:{x y}]			zero or more, normally included
[{x | y}]		  zero or more, normally omitted
[:{x | y}]		zero or more with lower captioning, normally included

x y z			    implicit sequence
<-x y z ->		explicit sequence
<^x y z^>		  explicit stack sequence (ie. Stack)
<@ x y @>     alternating sequence (ie. AlternatingSequence)
<?x y z?>     optional sequence (ie. OptionalSequence)

(?x|y|z?)			alternatives (ie, Choice)
(?x|:y|z?)		alternatives, normally y (ie, Choice)
(-x|y|z-)		  horizontal alternatives (ie. HorizontalChoice)
($x|:y|z$)	  all alternatives, normally y (ie. MultipleChoice)
(&x|:y|z&)	  any alternatives, normally y (ie. MultipleChoice)
-						  by pass (ie. Skip)

"title|link"		  terminal with optional link
<"title|link">	  nonterminal with optional link
+=[|title|link= start (simple: ||, complex: |)
=title|link|]=+ end (simple: ||, complex: |, join back to main line: +)
/"text|link"/	comment (see titleLinkDelim for delimiter)

"x" can also be written 'x' or """x"""

pragmas:
    @jsc 				supports Tab Atkins Jr. (and others) original JS code
    @trk 				creates a track diagram (ie. No rules around start|end) rather that the Railroad diagram
    @dbg				toggle
    @esc<char>	set character
 */
import funcs, { Options } from './tracks-model.js';
import * as tracks from './tracks-model.js';
// function casts to support @jsc pragma
let TrackDiagram = (...a) => funcs.TrackDiagram(...a);
let Diagram = (...a) => funcs.Diagram(...a);
let ComplexDiagram = (...a) => funcs.ComplexDiagram(...a);
let Sequence = (...a) => funcs.Sequence(...a);
let Stack = (...a) => funcs.Stack(...a);
let OptionalSequence = (...a) => funcs.OptionalSequence(...a);
let AlternatingSequence = (...a) => funcs.AlternatingSequence(...a);
let Choice = (...a) => funcs.Choice(...a);
let HorizontalChoice = (...a) => funcs.HorizontalChoice(...a);
let MultipleChoice = (...a) => funcs.MultipleChoice(...a);
let Optional = (...a) => funcs.Optional(...a);
let OneOrMore = (...a) => funcs.OneOrMore(...a);
let ZeroOrMore = (...a) => funcs.ZeroOrMore(...a);
let Start = (...a) => funcs.Start(...a);
let End = (...a) => funcs.End(...a);
let Terminal = (...a) => funcs.Terminal(...a);
let NonTerminal = (...a) => funcs.NonTerminal(...a);
let Comment = (...a) => funcs.Comment(...a);
let Skip = (...a) => funcs.Skip(...a);
let Block = (...a) => funcs.Block(...a);
export class ParserManager {
    constructor(src) {
        this.context = new ParserReadContext();
        this.parsers = new Array();
        this.tokenStack = [];
        this.targetTracksDiagram = false;
        this.context.source = src.trim();
        this.loadParsers();
        this.reorderParsers();
    }
    parse() {
        let items = [];
        while (this.context.hasMore()) {
            let item = this.parseNextComponent(undefined);
            if (item)
                items.push(item);
            this.context.skipWhitespace();
        }
        let diag;
        if (items.length === 1 && items[0].implementsDiagramable)
            diag = items[0];
        else
            diag = this.targetTracksDiagram ? new tracks.TracksDiagram(...items) : new tracks.Diagram(...items);
        return diag;
    }
    parseNextComponent(callerState) {
        let state = this.getParser(callerState);
        let item = state.parser.parse(state);
        return item;
    }
    getParser(callerState) {
        for (let i = 0; i < this.parsers.length; i++) {
            const parser = this.parsers[i];
            let state = parser.canParse();
            if (state) {
                return state;
            }
        }
        let tsStr = this.prepareTroubleshootingHint();
        throw new Error(`Illegal argument: [${callerState ? callerState.operationName : 'Diagram'}] - Within  ${callerState ? callerState.openSyntax + " ... " + callerState.closeSyntax : 'Root'}.  No parsers can handle the following signature tokens: "${this.context.source.substr(this.context.pos, 4)}. Refer to this tokenised stack for troubleshooting: ${tsStr}"`);
    }
    prepareTroubleshootingHint() {
        // for (let i = 0; i < this.tokenStack.length; i++) {
        // 	let ts = this.tokenStack[i];
        // 	ts.value = JSON.stringify(ts.value, null, "\t");
        // }
        return JSON.stringify(this.tokenStack, null, "\t");
    }
    addToTokenisedStack(state) {
        let tokenisedItem = {
            signature: state.openSyntax,
            operator: state.operationName,
            value: state.attr
        };
        this.tokenStack.push(tokenisedItem);
    }
    registerParser(parser) {
        this.parsers.push(parser);
    }
    loadParsers() {
        // load container parsers 1st
        this.registerParser(new SequenceParser(this));
        this.registerParser(new ChoiceParser(this));
        this.registerParser(new OptionalParser(this));
        this.registerParser(new RepeatParser(this));
        this.registerParser(new LiteralNonTerminalParser(this));
        this.registerParser(new NonTerminalParser(this));
        // NonTerminalParser must preceed TerminalParser to ensure <" matches before just "
        this.registerParser(new TerminalParser(this));
        this.registerParser(new CommentParser(this));
        this.registerParser(new StartParser(this));
        this.registerParser(new EndParser(this));
        this.registerParser(new SkipParser(this));
        this.registerParser(new BlockParser(this));
        this.registerParser(new PragmaParser(this));
    }
    reorderParsers() {
    }
}
export default ParserManager;
class ParserReadContext {
    constructor() {
        // Pragmas
        this.escapeChar = '\\'; // modified by @esc <char> 
        this.source = "";
        this.pos = 0;
        this.sigCacheHdr = [];
    }
    hasMore() {
        return (this.pos < this.source.length);
    }
    readIn(len) {
        this.pos += len;
        return this.pos;
    }
    skipTo(newPos) {
        let ret = this.source.substr(this.pos, newPos - this.pos);
        this.readIn(newPos - this.pos);
        return ret;
    }
    skipWhitespace() {
        let match = this.source.substr(this.pos).match(/\S/);
        if (match && match.index > 0) {
            this.readIn(match.index);
        }
        return this.pos;
    }
    hasSignature(regOrStr) {
        if (this.sigCachePos !== this.pos) {
            this.sigCacheHdr = [];
            this.sigCachePos = this.pos;
        }
        let ret = undefined;
        if (typeof regOrStr === "string") {
            if (!this.sigCacheHdr[regOrStr.length])
                this.sigCacheHdr[regOrStr.length] = this.source.substr(this.pos, regOrStr.length);
            if (this.sigCacheHdr[regOrStr.length] === regOrStr)
                ret = regOrStr;
        }
        else {
            if (!this.sigCacheHdr[0])
                this.sigCacheHdr[0] = this.source.substr(this.pos);
            let match = this.sigCacheHdr[0].match(regOrStr);
            if (match)
                ret = match[0];
        }
        return ret;
    }
    escapedStringIndexOf(src, criteria, startFrom) {
        let foundPos = -1;
        while (true) {
            foundPos = src.indexOf(criteria, startFrom);
            if (foundPos === -1)
                break;
            if (src.charAt(foundPos - 1) !== this.escapeChar) {
                break;
            }
            startFrom = foundPos + 1;
        }
        return foundPos;
    }
    escapedRegExIndexOf(src, criteria, startFrom, storeMatch) {
        let foundPos = -1;
        let match = undefined;
        while (true) {
            criteria.lastIndex = 0;
            let remainder = src.substr(startFrom);
            match = remainder.match(criteria);
            if (match && match.index >= 0) {
                foundPos = startFrom + match.index;
            }
            else
                foundPos = -1;
            if (foundPos === -1)
                break;
            if (src.charAt(foundPos - 1) !== this.escapeChar) {
                break;
            }
            startFrom = foundPos + 1;
        }
        storeMatch[0] = foundPos > -1 ? match[0] : undefined;
        return foundPos;
    }
    unescape(src) {
        let doubleEsc = this.escapeChar + this.escapeChar;
        let isDoubleEscaped = src.indexOf(doubleEsc) !== -1;
        let hackRepl = undefined;
        let ret = undefined;
        if (isDoubleEscaped) {
            hackRepl = "'^_:\\$\\:_^'".replace(this.escapeChar, "");
            ret = src.replace(doubleEsc, hackRepl);
        }
        ret = src.replace(this.escapeChar, "");
        if (isDoubleEscaped)
            ret = ret.replace(hackRepl, this.escapeChar);
        return ret;
    }
}
class ParserState {
    constructor(parser, startsFrom, openSyntax, closeSyntax, operationName) {
        this.parser = parser;
        this.startsFrom = startsFrom;
        this.openSyntax = openSyntax;
        this.closeSyntax = closeSyntax;
        this.operationName = operationName;
        this.items = [];
        this.attr = {};
    }
}
// Note: All parsers must be implemented to be stateless. 
// Use ParserState for storage!
class ComponentParser {
    constructor(controller) {
        this.controller = controller;
        this.ctx = this.controller.context;
    }
    canParseWith(openingList, closingList, regOrStr, opName) {
        let state = undefined;
        let match = this.ctx.hasSignature(regOrStr);
        if (match) {
            let i = openingList.indexOf(match);
            state = new ParserState(this, this.ctx.pos + 2, openingList[i], closingList[i], opName);
        }
        return state;
    }
    raiseMissingClosureError(open, close, op) {
        throw new Error(`Missing closure: ${open} ... ${close} - ${op} terminated with closing notation`);
    }
}
class TitleLinkComponentParser extends ComponentParser {
    readUntilClosingToken(state, useClosingRegEx) {
        this.controller.addToTokenisedStack(state);
        this.ctx.readIn(state.openSyntax.length);
        let pos = -1;
        if (useClosingRegEx) {
            let storeMatch = [];
            pos = this.ctx.escapedRegExIndexOf(this.ctx.source, useClosingRegEx, this.ctx.pos, storeMatch);
            state.closeSyntax = storeMatch[0];
        }
        else
            pos = this.ctx.escapedStringIndexOf(this.ctx.source, state.closeSyntax, this.ctx.pos);
        if (pos === -1)
            this.raiseMissingClosureError(state.openSyntax, state.closeSyntax, state.operationName);
        let text = this.ctx.skipTo(pos);
        text = this.ctx.unescape(text);
        let ret = this.finaliseState(text, state);
        this.ctx.readIn(state.closeSyntax.length);
        return ret;
    }
    finaliseState(comment, state) {
        let ret = this.readTitleLink(comment);
        state.attr.text = ret[0];
        state.attr.link = ret[1];
        state.items.push(ret);
        return ret;
    }
    readTitleLink(comment) {
        let pos = this.ctx.escapedStringIndexOf(comment, TitleLinkComponentParser.DELIM, 0);
        if (pos === -1)
            return [comment, undefined];
        let link = comment.substr(pos + 1);
        let escapedComment = comment.substr(0, pos);
        comment = this.ctx.unescape(escapedComment);
        return [comment, link];
    }
}
TitleLinkComponentParser.DELIM = "|";
/*
<-x y z ->		explicit sequence
<^x y z^>		  explicit stack sequence (ie. Stack)
<@ x y @>     alternating sequence (ie. AlternatingSequence)
<?x y z?>     optional sequence (ie. OptionalSequence)
*/
class SequenceParser extends ComponentParser {
    canParse() {
        let ret = this.canParseWith(SequenceParser.OPEN_LIST, SequenceParser.CLOSE_LIST, SequenceParser.REG_EX, "sequence parser");
        return ret;
    }
    parse(state) {
        this.controller.addToTokenisedStack(state);
        this.ctx.readIn(state.openSyntax.length);
        state.attr.closed = false;
        state.attr.type = SequenceParser.OPEN_LIST.indexOf(state.openSyntax);
        this.ctx.skipWhitespace();
        while (this.ctx.hasMore()) {
            let match = this.ctx.hasSignature(state.closeSyntax);
            if (match) {
                this.ctx.readIn(state.closeSyntax.length);
                state.attr.closed = true;
                break;
            }
            let items = this.controller.parseNextComponent(state);
            state.items.push(items);
            this.ctx.skipWhitespace();
        }
        if (!state.attr.closed)
            this.raiseMissingClosureError(state.openSyntax, state.closeSyntax, state.operationName);
        return this.constructModel(state);
    }
    constructModel(state) {
        let trkType = undefined;
        if (state.attr.type === 0)
            trkType = new tracks.Sequence(...state.items);
        else if (state.attr.type === 1)
            trkType = new tracks.Stack(...state.items);
        else if (state.attr.type === 2)
            trkType = new tracks.AlternatingSequence(...state.items);
        else
            trkType = new tracks.OptionalSequence(...state.items);
        return trkType;
    }
}
SequenceParser.OPEN_LIST = ["<-", "<^", "<@", "<?"];
SequenceParser.CLOSE_LIST = ["->", "^>", "@>", "?>"];
SequenceParser.REG_EX = /^(<-|<\^|<\@|<\?)/;
/*
(?x|y|z?)			alternatives (ie, Choice)
(?x|:y|z?)		alternatives, normally y (ie, Choice)
(-x|y|z-)		  horizontal alternatives (ie. HorizontalChoice)
($x|:y|z$)	  all alternatives, normally y (ie. MultipleChoice)
(&x|:y|z&)	  any alternatives, normally y (ie. MultipleChoice)
*/
class ChoiceParser extends ComponentParser {
    canParse() {
        let ret = this.canParseWith(ChoiceParser.OPEN_LIST, ChoiceParser.CLOSE_LIST, ChoiceParser.REG_EX, "choice parser");
        return ret;
    }
    parse(state) {
        this.controller.addToTokenisedStack(state);
        this.ctx.readIn(state.openSyntax.length);
        state.attr.closed = false;
        this.prepareInitialState(state);
        this.ctx.skipWhitespace();
        while (this.ctx.hasMore()) {
            let match = this.ctx.hasSignature(state.closeSyntax);
            if (match) {
                this.ctx.readIn(state.closeSyntax.length);
                state.attr.closed = true;
                break;
            }
            match = this.ctx.hasSignature(ChoiceParser.OPTION_DELIM);
            if (match)
                this.handleNextOption(state);
            else {
                match = this.ctx.hasSignature(ChoiceParser.PREFER_DELIM);
                if (match)
                    this.handlePreferredOption(state);
            }
            if (!match) {
                let item = this.controller.parseNextComponent(state);
                state.items[state.attr.optionsCount - 1].push(item);
            }
            this.ctx.skipWhitespace();
        }
        if (!state.attr.closed)
            this.raiseMissingClosureError(state.openSyntax, state.closeSyntax, state.operationName);
        return this.constructModel(state);
    }
    prepareInitialState(state) {
        state.attr.type = ChoiceParser.OPEN_LIST.indexOf(state.openSyntax);
        state.attr.optionsCount = 1;
        state.attr.preferIndex = -1;
        state.items[0] = []; // implicit sequence for each choice section
    }
    handlePreferredOption(state) {
        this.ctx.readIn(ChoiceParser.PREFER_DELIM.length);
        if (state.attr.preferIndex > -1)
            throw new Error(`Illegal argument: ${state.openSyntax} ... ${state.closeSyntax} - ${state.operationName} supports only 1 default preceding the option using ${ChoiceParser.PREFER_DELIM}`);
        state.attr.preferIndex = state.attr.optionsCount - 1;
    }
    handleNextOption(state) {
        this.ctx.readIn(ChoiceParser.OPTION_DELIM.length);
        if (state.attr.optionsCount === 1 && state.items[state.attr.optionsCount - 1].length === 0)
            throw new Error(`Illegal argument:  ${state.openSyntax} ... ${state.closeSyntax} - ${state.operationName} requires an option before/betweem ${ChoiceParser.OPTION_DELIM}`);
        state.attr.optionsCount++;
        state.items[state.attr.optionsCount - 1] = [];
    }
    constructModel(state) {
        let trkType = undefined;
        let normal = state.attr.preferIndex === -1 ? 0 : state.attr.preferIndex;
        this.finaliseItemsForModel(state);
        if (state.attr.type === 0)
            trkType = new tracks.Choice(normal, ...state.items);
        else if (state.attr.type === 1)
            trkType = new tracks.HorizontalChoice(...state.items);
        else if (state.attr.type >= 2) {
            let type = state.attr.type === 2 ? "all" : "any";
            trkType = new tracks.MultipleChoice(normal, type, ...state.items);
        }
        return trkType;
    }
    finaliseItemsForModel(state) {
        let revision = [];
        for (let i = 0; i < state.items.length; i++) {
            if (state.items[i].length === 0)
                state.items[i] = undefined;
            else if (state.items[i].length === 1)
                state.items[i] = state.items[i][0];
            else {
                state.items[i] = new tracks.Sequence(...state.items[i]);
            }
            if (state.items[i])
                revision.push(state.items[i]);
        }
        state.items = revision;
    }
}
ChoiceParser.OPEN_LIST = ["(?", "(-", "($", "(&"];
ChoiceParser.CLOSE_LIST = ["?)", "-)", "$)", "&)"];
ChoiceParser.OPTION_DELIM = "|";
ChoiceParser.PREFER_DELIM = ":";
ChoiceParser.REG_EX = /^(\(\?|\(-|\(\$|\(&)/;
/*
/"text|link"/	comment (see titleLinkDelim for delimiter)
*/
class CommentParser extends TitleLinkComponentParser {
    canParse() {
        let ret = this.canParseWith(CommentParser.OPEN_LIST, CommentParser.CLOSE_LIST, CommentParser.OPEN_LIST[0], "comment parser");
        return ret;
    }
    parse(state) {
        let titleLinkArr = super.readUntilClosingToken(state);
        let trkType = new tracks.Comment(titleLinkArr[0], undefined, titleLinkArr[1]);
        return trkType;
    }
}
CommentParser.OPEN_LIST = ["/\""];
CommentParser.CLOSE_LIST = ["\"/"];
/*
<"title|link">	  nonterminal with optional link
*/
class NonTerminalParser extends TitleLinkComponentParser {
    canParse() {
        let ret = this.canParseWith(NonTerminalParser.OPEN_LIST, NonTerminalParser.CLOSE_LIST, NonTerminalParser.OPEN_LIST[0], "nonterminal parser");
        return ret;
    }
    parse(state) {
        let titleLinkArr = super.readUntilClosingToken(state);
        let trkType = new tracks.NonTerminal(titleLinkArr[0], undefined, titleLinkArr[1]);
        return trkType;
    }
}
NonTerminalParser.OPEN_LIST = ["<\""];
NonTerminalParser.CLOSE_LIST = ["\">"];
/*
"title|link"		  terminal with optional link
*/
class TerminalParser extends TitleLinkComponentParser {
    canParse() {
        let ret = this.canParseWith(TerminalParser.OPEN_LIST, TerminalParser.CLOSE_LIST, TerminalParser.OPEN_LIST[0], "terminal parser");
        return ret;
    }
    parse(state) {
        let titleLinkArr = super.readUntilClosingToken(state);
        let trkType = new tracks.Terminal(titleLinkArr[0], undefined, titleLinkArr[1]);
        return trkType;
    }
}
TerminalParser.OPEN_LIST = ["\""];
TerminalParser.CLOSE_LIST = ["\""];
export class StartParser extends TitleLinkComponentParser {
    canParse() {
        let state = undefined;
        let match = this.ctx.hasSignature(StartParser.REG_EX);
        if (match)
            state = new ParserState(this, this.ctx.pos + match.length, match, StartParser.CLOSE, "start parser");
        return state;
    }
    parse(state) {
        let titleLinkArr = super.readUntilClosingToken(state);
        state.attr.connectToMainline = (state.openSyntax.charAt(0) === "+");
        state.attr.type = state.openSyntax.endsWith("=[|") ? "simple" : "complex";
        let trkType = new tracks.Start(state.attr.type, titleLinkArr[0], titleLinkArr[1], state.attr.connectToMainline);
        return trkType;
    }
}
StartParser.CLOSE = "=";
StartParser.REG_EX = /^\+?=\[\|?/;
export class EndParser extends TitleLinkComponentParser {
    canParse() {
        let state = undefined;
        let match = this.ctx.hasSignature(EndParser.OPEN);
        if (match)
            state = new ParserState(this, this.ctx.pos + match.length, match, StartParser.CLOSE, "end parser");
        return state;
    }
    parse(state) {
        let titleLinkArr = super.readUntilClosingToken(state, EndParser.REG_EX);
        state.attr.connectToMainline = (state.closeSyntax.charAt(state.closeSyntax.length - 1) === "+");
        state.attr.type = state.closeSyntax.startsWith("|]=") ? "simple" : "complex";
        let trkType = new tracks.End(state.attr.type, titleLinkArr[0], titleLinkArr[1], state.attr.connectToMainline);
        return trkType;
    }
}
EndParser.OPEN = "=";
EndParser.REG_EX = /\|?\]=\+?/;
export class SkipParser extends ComponentParser {
    canParse() {
        let state = undefined;
        let match = this.ctx.hasSignature(SkipParser.OPEN);
        if (match)
            state = new ParserState(this, this.ctx.pos + match.length, match, undefined, "skip parser");
        return state;
    }
    parse(state) {
        this.ctx.readIn(SkipParser.OPEN.length);
        return new tracks.Skip();
    }
}
SkipParser.OPEN = "~"; // no close
export class BlockParser extends ComponentParser {
    canParse() {
        let state = undefined;
        let match = this.ctx.hasSignature(BlockParser.OPEN);
        if (match)
            state = new ParserState(this, this.ctx.pos + match.length, match, undefined, "block parser");
        return state;
    }
    parse(state) {
        this.ctx.readIn(BlockParser.OPEN.length);
        return new tracks.Block();
    }
}
BlockParser.OPEN = "#"; // no close
/*
regEx = /([a-zA-Z0-9_.-]+)/g;
*/
class LiteralNonTerminalParser extends ComponentParser {
    canParse() {
        let state = undefined;
        let char = this.ctx.source.charAt(this.ctx.pos);
        let match = char.match(/([a-zA-Z0-9_.-]+)/);
        if (match && match.index > -1)
            state = new ParserState(this, this.ctx.pos + 1, char, "/([a-zA-Z0-9_.-]+)/g", "literal terminal parser");
        return state;
    }
    parse(state) {
        this.controller.addToTokenisedStack(state);
        let regEx = /([a-zA-Z0-9_.-]+)/g;
        regEx.lastIndex = this.ctx.pos;
        let match = regEx.exec(this.ctx.source);
        state.attr.name = undefined;
        if (match.index === this.ctx.pos) {
            state.attr.name = this.ctx.source.substr(this.ctx.pos, match[1].length);
            state.items.push(state.attr.name);
            this.ctx.readIn(match[1].length);
        }
        else
            throw new Error(`Illegal argument: [a-zA-Z0-9_.-]...[a-zA-Z0-9_.-] - ${state.operationName} supports only standard characterset for naming`);
        let trkType = new tracks.NonTerminal(state.attr.name);
        return trkType;
    }
}
/*
[x]				    optional, normally omitted
[:x]			    optional, normally included
[x y]
*/
class OptionalParser extends ComponentParser {
    canParse() {
        let ret = this.canParseWith(OptionalParser.OPEN_LIST, OptionalParser.CLOSE_LIST, OptionalParser.OPEN_LIST[0], "optional parser");
        return ret;
    }
    parse(state) {
        this.controller.addToTokenisedStack(state);
        this.ctx.readIn(state.openSyntax.length);
        this.ctx.skipWhitespace();
        state.attr.closed = false;
        let match = this.ctx.hasSignature(OptionalParser.PREFER_DELIM);
        state.attr.preferIndex = 0;
        if (match) {
            state.attr.preferIndex = 1;
            this.ctx.readIn(OptionalParser.PREFER_DELIM.length);
            this.ctx.skipWhitespace();
        }
        while (this.ctx.hasMore()) {
            match = this.ctx.hasSignature(state.closeSyntax);
            if (match) {
                this.ctx.readIn(state.closeSyntax.length);
                state.attr.closed = true;
                break;
            }
            let item = this.controller.parseNextComponent(state);
            state.items.push(item);
            this.ctx.skipWhitespace();
        }
        if (state.items.length === 0)
            throw new Error(`Invalid state: ${state.openSyntax} ... ${state.closeSyntax} - ${state.operationName} extended an operand`);
        if (!state.attr.closed)
            this.raiseMissingClosureError(state.operationName, state.closeSyntax, state.operationName);
        let item = state.items.length === 1 ? state.items[0] : new tracks.Sequence(...state.items);
        let trkType = new tracks.Optional(item, state.attr.preferIndex === 0 ? "skip" : undefined);
        return trkType;
    }
}
OptionalParser.OPEN_LIST = ["["];
OptionalParser.CLOSE_LIST = ["]"];
OptionalParser.PREFER_DELIM = ":";
/*
{x}				one or more
{x y}		  one or more
{x | y}		zero or more with lower captioning of y
*/
class RepeatParser extends ComponentParser {
    canParse() {
        let ret = this.canParseWith(RepeatParser.OPEN_LIST, RepeatParser.CLOSE_LIST, RepeatParser.OPEN_LIST[0], "repeat parser");
        return ret;
    }
    parse(state) {
        this.controller.addToTokenisedStack(state);
        this.ctx.readIn(state.openSyntax.length);
        this.ctx.skipWhitespace();
        state.attr.closed = false;
        state.attr.lowerIndex = 0;
        state.items = [[], []];
        let match = this.ctx.hasSignature(RepeatParser.ARROW_DELIM);
        state.attr.showArrow = false;
        if (match) {
            state.attr.showArrow = true;
            this.ctx.readIn(OptionalParser.PREFER_DELIM.length);
            this.ctx.skipWhitespace();
        }
        while (this.ctx.hasMore()) {
            let match = this.ctx.hasSignature(state.closeSyntax);
            if (match) {
                this.ctx.readIn(state.closeSyntax.length);
                state.attr.closed = true;
                break;
            }
            match = this.ctx.hasSignature(RepeatParser.LOWER_DELIM);
            if (match) {
                this.handleLowerDelimiter(state);
            }
            else {
                let item = this.controller.parseNextComponent(state);
                state.items[state.attr.lowerIndex].push(item);
            }
            this.ctx.skipWhitespace();
        }
        if (state.items.length === 0)
            throw new Error(`Invalid state: ${state.openSyntax} ... ${state.closeSyntax} - ${state.operationName} extended an operand`);
        if (!state.attr.closed)
            this.raiseMissingClosureError(state.openSyntax, state.closeSyntax, state.operationName);
        return this.constructModel(state);
    }
    constructModel(state) {
        let item = state.items[0].length === 1 ? state.items[0][0] : new tracks.Sequence(...state.items[0]);
        let rep = undefined;
        if (state.items[1].length === 1)
            rep = state.items[1][0];
        else if (state.items[1].length > 1)
            rep = new tracks.Sequence(...state.items[1]);
        let trkType = new tracks.OneOrMore(item, rep, state.attr.showArrow);
        return trkType;
    }
    handleLowerDelimiter(state) {
        this.ctx.readIn(RepeatParser.LOWER_DELIM.length);
        if (state.attr.lowerIndex !== 0)
            throw new Error(`Illegal argument: ${state.openSyntax} ... ${state.closeSyntax} - ${state.operationName} supports only 1 lower caption delimiter per repeat loop using ${RepeatParser.LOWER_DELIM}`);
        state.attr.lowerIndex++;
        state.items[state.attr.lowerIndex] = [];
    }
}
RepeatParser.OPEN_LIST = ["{"];
RepeatParser.CLOSE_LIST = ["}"];
RepeatParser.LOWER_DELIM = "|";
RepeatParser.ARROW_DELIM = ":";
/*
    @jsc 				supports Tab Atkins Jr. (and others) original JS code
    @trk 				creates a track diagram (ie. No rules around start|end) rather that the Railroad diagram
    @dbg				toggle
    @esc<char>	set character
*/
class PragmaParser extends ComponentParser {
    canParse() {
        let state = undefined;
        let match = this.ctx.hasSignature(PragmaParser.REG_EX);
        if (match)
            state = new ParserState(this, this.ctx.pos + 1, match, "/^@(trk|jsc|dbg|esc.)/", "pragma parser");
        return state;
    }
    parse(state) {
        this.controller.addToTokenisedStack(state);
        this.ctx.readIn(state.openSyntax.length);
        let ret = undefined;
        if (state.openSyntax === "@trk") {
            this.controller.targetTracksDiagram = true;
        }
        else if (state.openSyntax === "@jsc") {
            ret = this.parseJavascriptCode(state);
        }
        else if (state.openSyntax === "@dbg") {
            Options.DEBUG = !Options.DEBUG;
            state.attr.debug = Options.DEBUG;
        }
        else if (state.openSyntax.startsWith("@esc")) {
            this.ctx.escapeChar = this.ctx.source.charAt(this.ctx.pos - 1); // read ahead
            state.attr.escapeChar = this.ctx.escapeChar;
        }
        return ret;
    }
    parseJavascriptCode(state) {
        state.closeSyntax = state.openSyntax;
        let pos = this.ctx.source.indexOf("@jsc", this.ctx.pos);
        if (pos === -1)
            this.raiseMissingClosureError(state.openSyntax, state.closeSyntax, "javascript parser");
        state.attr.script = this.ctx.source.substr(state.startsFrom + state.openSyntax.length, pos - (state.startsFrom + state.openSyntax.length));
        this.ctx.skipTo(pos);
        pos = this.ctx.readIn(state.closeSyntax.length);
        let ret = eval(state.attr.script);
        return ret;
    }
}
PragmaParser.REG_EX = /^@(trk|jsc|dbg|esc.)/;
//# sourceMappingURL=tracks-parser.js.map