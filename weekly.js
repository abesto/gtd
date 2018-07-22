const { execSync } = require('child_process')

const inquirer = require('inquirer')
const chalk = require('chalk')
const boxen = require('boxen')


// Wrappers around taskwarrior
const pendingOrWaiting = '\\( status:pending or status:waiting \\)'
const task = (args, opts={stdio: 'inherit'}) => {
  const cmd = `task ${args}`.replace(/\n/g, ' ').replace(/ +/g, ' ')
  console.log(chalk`{gray => ${cmd}}`)
  return execSync(cmd, opts)
}
const captureTask = (args) => task(args, {}).toString()
const taskLines = (args) => captureTask(args).split('\n').map(l => l.trim()).filter(l => l.length > 0)
const printTasks = (ids) => task(`rc.report.next.filter= rc.verbose=label,sync next ${ids.join(',')}`)
const loadTasks = (args) => JSON.parse(captureTask(args + ' export'))

// Step logic implementations
const pause = (prompt) => prompt({
  type: 'input',
  name: 'pause',
  message: 'Press Return when done'
})

const projectReview = async (prompt, stepHeader) => {
  const projects = taskLines(`${pendingOrWaiting} _unique project`)
  for (const [index, project] of projects.entries()) {
    const projectHeader = chalk`{gray (${index + 1}/${projects.length})} Project: {white.bold ${project}}`
    console.log(boxen(
      chalk`${stepHeader}\n${projectHeader}`,
      {borderStyle: 'round'}
    ))
    task(
      `rc.report.next.filter='status:pending or status:waiting'
       rc.report.next.columns=id,start.age,entry.age,depends,priority,project,tags,recur,scheduled.countdown,wait.remaining,due.relative,until.remaining,description,urgency
       rc.report.next.labels=ID,Active,Age,Deps,P,Project,Tag,Recur,S,Wait,Due,Until,Description,Urg
       rc.verbose=label,sync
       next "project.is:${project}"
`
    )
    await prompt({
      type: 'input',
      name: 'pause',
      suffix: boxen(chalk`{gray ^^^} ${projectHeader} {gray ^^^}`),
      message: 'Press Return once all tasks for the project updated\n'
    })
  }
}

const setNextTask = async (prompt, taskIds, message) => {
  const result = await prompt({
    name: 'chooseNext',
    type: 'list',
    message: message,
    prefix: chalk`{red !}`,
    choices: loadTasks(taskIds.join(',')).map(t => ({name: chalk`{gray ${t.id}} ${t.description}`,
                                                     short: t.description,
                                                     value: t.id}))
  })
  const nextId = result.chooseNext
  const rest = taskIds.filter(id => id != nextId)
  if (rest.length > 0) {
    task(`${rest.join(',')} mod -next`)
  }
  task(`${nextId} mod +next`)
}

const nextReviewSingleProject = (prompt, project, projects) => {
  const subprojects = projects.filter(other => other.indexOf(`${project}.`) === 0)
  const isLeafProject = subprojects.length === 0
  const taskIds = taskLines(`${pendingOrWaiting} project.is:${project} _unique id`)
  const nextTaskIds = taskLines(`${pendingOrWaiting} project.is:${project} +next _unique id`)

  // Non-leaf projects should have no tasks
  if (!isLeafProject) {
    if (taskIds.length > 0) {
      return async () => {
        console.info(chalk`{red Non-leaf project "${project}" must have no tasks}`)
        console.info(`Child projects: ${subprojects.join(', ')}`)
        printTasks(taskIds)
        await pause(prompt)
      }
    }
  }
  // For leaf projects, there should be exactly one next task.
  // That means that there isn't more than one...
  if (nextTaskIds.length > 1) {
    return async () => {
      await setNextTask(
        prompt,
        nextTaskIds,
        chalk`Leaf project "${project}" must have no more than one +next task, has multiple. Choose one.`,
      )
    }
  }
  // And also that there is at least one
  if (nextTaskIds.length === 0) {
    return async () => {
      await setNextTask(
        prompt,
        taskIds,
        `Leaf project "${project}" must have a +next task, has none. Choose one.`
      )
    }
  }
  // All is well
  return null
}

const nextReview = async (prompt, stepHeader) => {
  let done = false
  while (!done) {
    done = true
    const projects = taskLines(`${pendingOrWaiting} _unique project`)
    for (const [index, project] of projects.entries()) {
      const projectHeader = chalk`{gray (${index + 1}/${projects.length})} Project: {white.bold ${project}}`
      const solveProblem = nextReviewSingleProject(prompt, project, projects)
      if (solveProblem !== null) {
        done = false
        await solveProblem()
        break
      }
    }
  }
}

const reviewSomeday = async (prompt) => {
  task('list +someday')
  await pause(prompt)
}

const processIn = async (prompt) => {
  while (true) {
    const inTasks = loadTasks('status:pending +in')
    if (inTasks.length > 0) {
      printTasks(inTasks.map(t => t.id))
      await prompt({
        name: '+in',
        type: 'input',
        prefix: chalk`{red !}`,
        message: 'Press Return after you have processed the above +in items'
      })
    } else {
      return
    }
  }
}

// Weekly review steps
const stepDefinitions = {
  'Mini mind sweep': {
    description: 'Take a minute to mentally review if you have any stuff you have not yet captured. Create +in items about them (in another terminal).',
    run: pause
  },
  'Project review': {
    description: `  * Record any tasks not in the system for each project
  * Mark any done tasks as such`,
    run: projectReview
  },
  '+next review': {
    description: 'Make sure all projects have exactly one +next item',
    run: nextReview
  },
  'Process e-mail': {
    description: `Ensure all e-mails in your inbox are handled. This can mean
  * archiving them and adding an entry (+in) to Taskwarrior on another terminal
  * organizing them into your e-mail based system - but make sure reminders get an item in Taskwarrior`,
    run: pause
  },
  'Check last two weeks and next two weeks in calendars': {
    description: 'This can often trigger ideas for new +in items',
    run: pause
  },
  'Review +someday list': {
    description: 'Is there anything else that should be on here? Is it time to activate one of these projects?',
    run: reviewSomeday
  },
  'Process +in': {
    description: 'Now is the time to turn all +in items into projects or actionable tasks',
    run: processIn
  }
}

// Preferred order of steps
const stepOrder = [
  'Mini mind sweep',
  'Project review',
  '+next review',
  'Process e-mail',
  'Check last two weeks and next two weeks in calendars',
  'Review +someday list',
  'Process +in'
]

// Do the thing!
async function main () {
  const prompt = inquirer.createPromptModule()
  const steps = stepOrder.map(name => Object.assign({name}, stepDefinitions[name]))
  for (const [index, step] of steps.entries()) {
    const number = index + 1
    const header = chalk`{gray [${number}/${steps.length}]} {bold.white.underline ${step.name}}`
    console.log(boxen(header + '\n' + step.description, {borderColor: 'magenta', borderStyle: 'round', padding: 1}))
    await step.run(prompt, header)
    console.log(chalk`${header} {green done}`)
  }
  task('sync')
}

main().catch(console.error)
