var fs = require('fs');
var esprima = require('esprima');
var estraverse = require('estraverse');
var filename = process.argv[2];
//console.log('Processing', filename);
var src = fs.readFileSync(filename);
var ast = esprima.parse(src, { tolerant: true, loc: true, range: true });

var utils = require('./utils.js');


var bindings = require('./javascript-call-graph/bindings'),
    astutil = require('./javascript-call-graph/astutil'),
    pessimistic = require('./javascript-call-graph/pessimistic'),
    semioptimistic = require('./javascript-call-graph/semioptimistic'),
    diagnostics = require('./javascript-call-graph/diagnostics'),
    callbackCounter = require('./javascript-call-graph/callbackCounter'),
    requireJsGraph = require('./javascript-call-graph/requireJsGraph');

ArgumentParser = require('argparse').ArgumentParser;

var crypto = require('crypto');

var graphlib = require("graphlib");
var dot = require("graphlib-dot");

var falafel = require('falafel');
var falafelMap = require('falafel-map');

//var walkes = require('walkes');
var esgraph = require('esgraph');


var g = new dot.DotDigraph();

var scopeChain = [];
var assignments = [];
var blockChain = [];

var successorMap = {};

var tempgraph = {};

var functions = [];


estraverse.traverse(ast, {
    enter: enter,
    leave: leave
});

function leave (node) {
    if (node.type === 'ExpressionStatement') {
        if(!node.expression.right || node.expression.right.type !== 'FunctionExpression' )
        {
            //connectNext(node);
            console.log(node.$entry)
        }
    }
}

function enter(node) {
    setParent(node);

    if (node.type === 'FunctionExpression' || node.type === 'FunctionDeclaration') {
        functions.push(node);
    }

    if (node.type === 'FunctionExpression' || node.type === 'FunctionDeclaration' || node.type === 'Program') {
        node.$exitnode = g.addNode(utils.makeId(node.type, node.loc)+'-exit');
    }

    if (node.type === 'CallExpression' || node.type === 'IfStatement' || node.type === 'DoWhileStatement' ||
        node.type === 'WhileStatement' || node.type === 'ForStatement' || node.type === 'DoWhileStatement' ||
        node.type === 'SwitchStatement' || node.type === 'ReturnStatement') {
        node.$gnode = g.addNode(utils.makeId(node.type, node.loc));

    }

    if (node.type === 'BlockStatement' || node.type === 'Program') {
        backToFront(node.body);
    }
    if (node.type === 'SwitchCase' ) {
        backToFront(node.consequent);
    }
    if (node.type === 'SwitchStatement') {
        backToFront(node.cases);
    }
};



functions.concat(ast).forEach(function (a, i) {
 //   console.log("*****" + utils.makeId(a.type, a.loc));
    //   console.log(node);
    if (!Array.isArray(a.body)) {
        estraverse.traverse(a.body, {
            enter: enter
        });
    }
    else {
        a.body.forEach(function (elm) {
            estraverse.traverse(elm, {
                enter: enter
            });
        });
    }


    function enter(b) {
//        console.log("enter " + utils.makeId(b.type, b.loc));

        if (b.type === 'FunctionExpression' || b.type === 'FunctionDeclaration') {
            this.skip();
        }

        else if (b.type === 'ExpressionStatement') {
            b.$entry = buildGraphFromExpr(b.expression);
        }
        else if (b.type === 'IfStatement') {
            b.$entry = buildGraphFromExpr(b.test);
            if (b.$entry){
                connectNodes(b.$entry.end,b.$gnode);
                b.$entry.end = b.$gnode;
            } else {
                b.$entry.start = b.$gnode;
                b.$entry.end = b.$gnode;
            }
        }
        else if (b.type === 'DoWhileStatement' || b.type === 'WhileStatement') {
// TODO
            b.$entry = buildGraphFromExpr(b.test);
        }
        else if (b.type === 'ForStatement') {
            var start;
            var end;
            if (b.init){
                b.init.$entry = buildGraphFromExpr(b.init);
                start = b.init.$entry.start;
                if (b.init.$entry.end) {
                    end = b.init.$entry.end;
                }
            }
            if (b.test){
                b.test.$entry = buildGraphFromExpr(b.test);
                if (!start){
                    start = b.test.$entry.start;
                }
                if (b.test.$entry.end) {
                    end = b.test.$entry.end;
                    connectNodes(b.init.$entry.end, b.test.$entry.start);
                }
            }
            if (b.update){
                b.update.$entry = buildGraphFromExpr(b.update);
                if (!start){
                    start = b.update.$entry.start;
                }
                if (b.init.$entry.end) {
                    end = b.update.$entry.end;
                    if(!connectNodes(b.test.$entry.end, b.update.$entry.start)){
                        connectNodes(b.init.$entry.end, b.update.$entry.start)
                    }
                }
            }
            connectNodes(end, b.$gnode);
            end = b.$gnode;
            if(!start){b.$gnode}

            b.$entry={};
            b.$entry.start = start;
            b.$entry.end = end;
        }
        else if (b.type === 'SwitchStatement') {
            // TODO
            b.$entry = buildGraphFromExpr(b.discriminant);
        }
        else if (b.type === 'ReturnStatement') {
            b.$entry = buildGraphFromExpr(b.argument);
            if (b.$entry){
                connectNodes(b.$entry.end,b.$gnode);
                b.$entry.end = b.$gnode;
            } else {
                b.$entry.start = b.$gnode;
                b.$entry.end = b.$gnode;
            }
        }
    }

});

function connectNodes(a,b) {
    if (a && b) {
        return g.addEdge(null, a.toString(), b.toString());
    } else {
        return false;
    }
}

function connectNext(a) {
    console.log(a);
    return g.addEdge(null, a.$entry.end.toString(), getSuccessor(a).start.toString());
}

function buildGraphFromExpr(astXNode) {
 //   console.log("building from " + utils.makeId(astXNode.type, astXNode.loc));
    var callExprs = [];
    var start;
    var end;

    estraverse.traverse(astXNode, {
        enter: enter,
        leave: leave
    });

    function enter(b) {
        //console.log("entering  a >>>>"+utils.makeId(b.type, b.loc));
        if (b.type === 'FunctionExpression') {
            this.skip();
        }
    };

    function leave(c) {
        if (c.type == 'CallExpression') {
            callExprs.push(c);
        }
    };

    if(callExprs.length){
        start = callExprs[0].$gnode;
        end = callExprs[0].$gnode;
    }

    for (var i = 0; i < (callExprs.length) - 1; i++) {

        var currentNode = callExprs[i];
        var successor = callExprs[i + 1];

        end = successor.$gnode;
        g.addEdge(null, currentNode.$gnode.toString(), successor.$gnode.toString());
    }
    return {
        start: start,
        end: end
    }
}


console.log(dot.write(g));

function backToFront(list) {
    // link all the children to the next sibling from back to front,
    // so the nodes already have .nextSibling
    // set when their getEntry is called
    for (var i = list.length - 1; i >= 0; i--) {
        var child = list[i];
        if (i < list.length - 1)
            child.$nextSibling = getEntry(list[i + 1]);
    }
}

function getEntry(astNode) {
    var target;
    switch (astNode.type) {
        case 'BlockStatement':
        case 'Program':
            return astNode.body.length && getEntry(astNode.body[0]) || getSuccessor(astNode);
        case 'DoWhileStatement':
        case 'ForStatement':
        case 'FunctionDeclaration':
        case 'IfStatement':
        case 'SwitchStatement':
        case 'EmptyStatement':
        case 'WhileStatement':
        case 'ExpressionStatement':
            return astNode.$entry || getSuccessor(astNode);
//        case 'TryStatement':
//            return getEntry(astNode.block);

        case 'BreakStatement':
            target = getJumpTarget(astNode, breakTargets);
            return target ? getSuccessor(target) : getExitNode(astNode);
        case 'ContinueStatement':
            target = getJumpTarget(astNode, continueTargets);
            switch (target.type) {
                case 'ForStatement':
                    // continue goes to the update, test or body
                    return target.update || target.test || getEntry(target.body);
                case 'ForInStatement':
                    return target;
                case 'DoWhileStatement':
                /* falls through */
                case 'WhileStatement':
                    return target.test;
            }
//        // unreached
//        /* falls through */
//        case 'BlockStatement':
//        /* falls through */
//        case 'Program':
//            return astNode.body.length && getEntry(astNode.body[0]) || getSuccessor(astNode);
//        case 'DoWhileStatement':
//            return getEntry(astNode.body);
//        case 'EmptyStatement':
//            return getSuccessor(astNode);
//        case 'ForStatement':
//            return astNode.init || astNode.test || getEntry(astNode.body);
//        case 'FunctionDeclaration':
//            return getSuccessor(astNode);
//        case 'IfStatement':
//            return astNode.test;
//        case 'SwitchStatement':
//            return getEntry(astNode.cases[0]);
//        case 'TryStatement':
//            return getEntry(astNode.block);
//        case 'WhileStatement':
//            return astNode.test;
        default:
            return getSuccessor(astNode);
    }
}

function getJumpTarget(astNode, types) {
    var parent = astNode.$parent;
    while (!~types.indexOf(parent.type) && parent.$parent)
        parent = parent.$parent;
    return ~types.indexOf(parent.type) ? parent : null;
}

function getExitNode(astNode) {
    return getEnclosingFunction(astNode).$exitnode
}

// Returns the function or program immediately enclosing the given node, possibly the node itself.
function getEnclosingFunction(node) {
    while  (node.type !== 'FunctionDeclaration' &&
        node.type !== 'FunctionExpression' &&
        node.type !== 'Program') {
        node = node.$parent;
    }
    return node;
}

function getSuccessor(astNode) {
    // part of a block -> it already has a nextSibling
    if (astNode.$nextSibling)
        return astNode.$nextSibling;
    var parent = astNode.$parent;
    if (!parent) // it has no parent -> exitNode
        return getExitNode(astNode);
    switch (parent.type) {
        case 'DoWhileStatement':
            return parent.test;
        case 'ForStatement':
            return parent.update || parent.test || getEntry(parent.body);
//        case 'SwitchCase':
//            // the sucessor of a statement at the end of a case block is
//            // the entry of the next cases consequent
//            if (!parent.$nextSibling)
//                return getSuccessor(parent);
//            var check = parent.cfg.nextSibling.astNode;
//            while (!check.consequent.length && check.cfg.nextSibling)
//                check = check.cfg.nextSibling.astNode;
//            // or the next statement after the switch, if there are no more cases
//            return check.consequent.length && getEntry(check.consequent[0]) || getSuccessor(parent.parent);
//        case 'WhileStatement':
//            return parent.test.cfg;
        default:
            return getSuccessor(parent);
    }
}

var continueTargets = [
    'ForStatement',
    'ForInStatement',
    'DoWhileStatement',
    'WhileStatement'];
var breakTargets = continueTargets.concat(['SwitchStatement']);
var throwTypes = [
    'AssignmentExpression', // assigning to undef or non-writable prop
    'BinaryExpression', // instanceof and in on non-objects
    'CallExpression', // obviously
    'MemberExpression', // getters may throw
    'NewExpression', // obviously
    'UnaryExpression' // delete non-deletable prop
];

var leafTypes = [
    'ExpressionStatement',
    'ContinueStatement',
    'BreakStatement',
    'ReturnStatement',
    'ThrowStatement',
    'WithStatement',
    'EmptyStatement'
];

var scopeNodes = [
    'FunctionDeclaration',
    'FunctionExpression',
    'Program'
];


function setParent(node) {
    for (var k in node) {
        if (!node.hasOwnProperty(k))
            continue;
        if (k[0] === '$')
            continue;
        var val = node[k];
        if (!val)
            continue;
        if (typeof val === "object" && typeof val.type === "string") {
            node[k].$parent = node;
        }
        else if (val instanceof Array) {
            for (var i=0; i<val.length; i++) {
                var elm = val[i];
                if (typeof elm === "object" && typeof elm.type === "string") {
                    val[i].$parent = node;
                }
            }
        }
    }
}

