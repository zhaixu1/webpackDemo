const { SyncHook } =  require('tapable');
const path = require('path');
const fs = require('fs');
const parser = require("@babel/parser");
let types = require("@babel/types"); //用来生成或者判断节点的AST语法树的节点
const traverse = require("@babel/traverse").default;
const generator = require("@babel/generator").default

console.log('加载了webpackjs 文件');

//获取文件路径
function tryExtensions(modulePath, extensions) {
  if (fs.existsSync(modulePath)) {
    return modulePath;
  }
  for (let i = 0; i < extensions?.length; i++) {
    let filePath = modulePath + extensions[i];
    if (fs.existsSync(filePath)) {
      return filePath;
    }
  }
  throw new Error(`无法找到${modulePath}`);
}
 

//将\替换成/
function toUnixPath(filePath) {
    return filePath.replace(/\\/g, "/");
  }
  
const baseDir = toUnixPath(process.cwd());
console.log(baseDir, 'BASEDIR');

// 定义两个插件
class WebpackRunPlugin {
    apply(compiler) {
        compiler.hooks.run.tap("webpackRunPlugin", () => {
            console.log('开始编译');
        })
    }
}

class WebpackDonePlugin {
    apply(compiler) {
        compiler.hooks.done.tap("webpackDonePlugin", () => {
            console.log('编译完成');
        })
    }
}

// 自定义两个loader
const loader1 = (source) => {
   return source + "//给你的代码加点注释：loader1";
 };
 
 const loader2 = (source) => {
   return source + "//给你的代码加点注释：loader2";
 };



class Compiler {
    constructor(webpackOptions) {
        this.options = webpackOptions;

        this.hooks = {
            run: new SyncHook(),
            done: new SyncHook()
        }
    }

    // 编译
    compile(callback){
        //虽然webpack只有一个Compiler，但是每次编译都会产出一个新的Compilation，
        //这里主要是为了考虑到watch模式，它会在启动时先编译一次，然后监听文件变化，如果发生变化会重新开始编译
        //每次编译都会产出一个新的Compilation，代表每次的编译结果
        let compilation = new Compilation(this.options);
        compilation.build(callback); //执行compilation的build方法进行编译，编译成功之后执行回调
    }

    // 执行run 方法
    run(callback) {
        console.log('this.hooks', this.hooks);
      this.hooks.run.call(); //在编译前触发run钩子执行，表示开始启动编译了
      const onCompiled = () => {
        this.hooks.done.call(); //当编译成功后会触发done这个钩子执行
      };
      this.compile(onCompiled); //开始编译，成功之后调用onCompiled
    }
}

// 编译对象， 这里控制编译主逻辑
class Compilation {
  constructor(webpackOptions) {
    this.options = webpackOptions;
    this.modules = []; //本次编译所有生成出来的模块
    this.chunks = []; //本次编译产出的所有代码块，入口模块和依赖的模块打包在一起为代码块
    this.assets = {}; //本次编译产出的资源文件
    this.fileDependencies = []; //本次打包涉及到的文件，这里主要是为了实现watch模式下监听文件的变化，文件发生变化后会重新编译
  }

  //当编译模块的时候，name：这个模块是属于哪个代码块chunk的，modulePath：模块绝对路径
  buildModule(name, modulePath) {
    let sourceCode = fs.readFileSync(modulePath, "utf8");
    //buildModule最终会返回一个modules模块对象，每个模块都会有一个id,id是相对于根目录的相对路径
    let moduleId = "./" + path.posix.relative(baseDir, modulePath); // 返回 modulePath 相对于 baseDir 的相对路径
    //6.2.2 创建模块对象
    let module = {
        id: moduleId,
        names: [name], //names设计成数组是因为代表的是此模块属于哪个代码块，可能属于多个代码块 
        dependencies: [], //它依赖的模块
        _source: "" //该模块的代码信息
    }
    //6.2.3 找到对应的 `Loader` 对源代码进行翻译和替换
    let loaders = [];
    let { rules = [] } = this.options.module;
    // console.log('module', this.options.module);
    rules.forEach((rule) => {
      let { test } = rule;
      //如果模块的路径和正则匹配，就把此规则对应的loader添加到loader数组中
      if (modulePath.match(test)) {
        console.log('能否匹配');
        loaders.push(...rule.use);
      }
    });

    // 从右向左进行转换
    sourceCode = loaders.reduceRight((code, loader) => {
        // console.log(code, 'code');
      //loader是一个字符串，loader是一个函数，loader是一个对象，loader是一个数组
      // console.log(loader(code));
      return loader(code);
    }, sourceCode)

    //通过loader翻译后的内容一定得是js内容，因为最后得走我们babel-parse，只有js才能成编译AST
    //第七步：找出此模块所依赖的模块，再对依赖模块进行编译
    //7.1：先把源代码编译成 [AST](https://astexplorer.net/)
    let ast = parser.parse(sourceCode, {sourceType: "module"})
    console.log('ast', ast);

    console.log('loaders', loaders);
    return module;
  }
    
  build(callback) {
    //这里开始做编译工作，编译成功执行callback
    // 五，根据配置文件找到“entry配置项的所有入口
    let entry = {};
    if(typeof this.options.entry === "string") {
        entry.main = this.options.entry;
    }else {
        entry = this.options.entry;
    }
    console.log('entry', entry);
    // 六、从入口文件出发，调用配置的“loader"规则，对各模块进行编译
    for(let entryName in entry) {
        //entryName="main" entryName就是entry的属性名，也将会成为代码块的名称
        let entryFilePath = path.posix.join(baseDir, entry[entryName]); //path.posix为了解决不同操作系统的路径分隔符,这里拿到的就是入口文件的绝对路径
        //6.1 把入口文件的绝对路径添加到依赖数组（`this.fileDependencies`）中，记录此次编译依赖的模块
        this.fileDependencies.push(entryFilePath);
        // console.log('this.fileDependencies', this.fileDependencies);
        // 6.2得到入口模块的的 `module` 对象 （里面放着该模块的路径、依赖模块、源代码等）
        // console.log(entryName, entryFilePath, 616161);
        let entryModule = this.buildModule(entryName, entryFilePath)
        // 6.3 把入口模块添加到 `this.modules` 数组中
        this.modules.push(entryModule);
        console.log("modules", this.modules);
    }
   callback()
  }
}



function webpack(webpackOptions) {
    // 获取compiler 对象
    const compiler = new Compiler(webpackOptions);
    console.log("@@@compiler", compiler);
    const { plugins } = webpackOptions;
    for (let plugin of plugins) {
      plugin.apply(compiler);
    }

    return compiler;
}



module.exports = {
    webpack: webpack, 
    WebpackRunPlugin: WebpackRunPlugin, 
    WebpackDonePlugin: WebpackDonePlugin,
    loader1,
    loader2
};