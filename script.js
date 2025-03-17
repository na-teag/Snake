//debugger
const WORLD_HEIGHT = 15
const WORLD_WIDTH = 17
const CELL_SIZE = 36

document.getElementById("gameCanvas").height = WORLD_HEIGHT*CELL_SIZE
document.getElementById("gameCanvas").width = WORLD_WIDTH*CELL_SIZE

const Maybe = value => ({
    map: f => (value != null ? Maybe(f(value)) : Maybe(null)),
    chain: f => (value != null ? f(value) : Maybe(null)),
    getOrElse: def => (value != null ? value : def)
});

const CanvasMonad = canvas => ({
    map: f => (canvas != null ? CanvasMonad(f(canvas)) : CanvasMonad(null)),
    chain: f => (canvas != null ? f(canvas) : CanvasMonad(null)),
    getOrElse: def => (canvas != null ? canvas : def),
    getContext: type => (canvas != null ? canvas.getContext(type) : null)
})

const InputMonad = target => ({
    subscribe: (eventType, handler) => {
        target.addEventListener(eventType, handler)
        return InputMonad(target)
    },
    map: f => InputMonad(f(target)),
    get: () => target
})

const entityCreator = entity => ({...entity})

/**
 * convert coordinates from classic math coordinate system where (0;0) is at the left down corner
 * to reversed y-axis coordinate system where (0;0) points to the left up corner
 * also include proportional conversion to game world size
 */
const convert = (x, y) => [x*CELL_SIZE, (-y+WORLD_HEIGHT-1)*CELL_SIZE, CELL_SIZE, CELL_SIZE];

const composeSystem = systems => systems.reduceRight(
    (acc, system) => state => system(acc(state)),
    state => state
)




function getNextPosition(currentPosition, direction) {
    let x = currentPosition.x
    let y = currentPosition.y
    switch (direction) {
        case "ArrowUp":
            return {x: x, y: y+1}
        case "ArrowDown":
            return {x: x, y: y-1}
        case "ArrowLeft":
            return {x: x-1, y: y}
        case "ArrowRight":
            return {x: x+1, y: y}
        default:
            throw new Error("Unknown direction :"+direction);
    }
}

function getOpposedDirection(direction) {
    switch (direction) {
        case "ArrowUp":
            return "ArrowDown"
        case "ArrowDown":
            return "ArrowUp"
        case "ArrowLeft":
            return "ArrowRight"
        case "ArrowRight":
            return "ArrowLeft"
        default:
            throw new Error("Unknown direction :"+direction);
    }
}

function getEmptyCells(fullCells) {
    // build an array of all possible cell
    const array = [];
    for (let x = 0; x < WORLD_WIDTH; x++) {
        for (let y = 0; y < WORLD_HEIGHT; y++) {
            array.push({ x:x, y:y });
        }
    }
    // get the empty cells
    return array.filter(item =>
        !fullCells.some(element => element.x === item.x && element.y === item.y)
    );
}

function drawBackgroundCells(canvasMonad) {
    const ctx = canvasMonad.getContext('2d')
    ctx.clearRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT)

    // draw the background cells
    for (let i = 0; i < WORLD_HEIGHT; i++) {
        for (let j = 0; j < WORLD_WIDTH; j++) {
            if ((i % 2 + j) % 2 === 0) {
                ctx.fillStyle = `rgb(170, 215, 81)`
            } else {
                ctx.fillStyle = `rgb(162, 209, 73)`
            }
            ctx.fillRect(...convert(j, i))
        }
    }
}


const inputSystem = (entities, inputMaybe) => entities.map(
    entity => {
        if (entity.id === "snake" && entity.position) {
            const input = inputMaybe.getOrElse({nextDirections: []})
            // cancel commands that go in the same direction that current direction or that are opposed to the current one (forbidden)
            while (input.nextDirections.length>0) {
                if (input.nextDirections[0] === entity.direction || input.nextDirections[0] === getOpposedDirection(entity.direction)) {
                    input.nextDirections.shift()
                } else {
                    break
                }
            }

            if (input.nextDirections.length === 0) {
                // if no new command
                //alert(JSON.stringify([getNextPosition(entity.position[0], entity.direction), ...entity.position]))
                return {
                    ...entity,
                    position: [getNextPosition(entity.position[0], entity.direction), ...entity.position]
                }
            }
            // if there is a next command
            //alert(JSON.stringify([getNextPosition(entity.position[0], input.nextDirections[0]), ...entity.position]))
            const test = input.nextDirections[0]
            input.nextDirections.shift()
            /* while (input.nextDirections.length>0) {
                 if (input.nextDirections[0] === test || input.nextDirections[0] === getOpposedDirection(test)) {
                     input.nextDirections.shift()
                 } else {
                     break
                 }
             }*/
            //console.log(input.nextDirections+"    "+test)
            return {
                ...entity,
                position: [getNextPosition(entity.position[0], test), ...entity.position],
                direction: test
            }
        }
        return entity
    }
)



const appleSystem = entities => entities.map(
    entity => {
        // check if the snake is eating an apple, if no remove the queue
        if (entity.id === "snake" && entity.position) {
            const isEatingApple = entities.some(apple =>
                apple.type === "apple" && apple?.position?.x === entity.position[0].x && apple?.position?.y === entity.position[0].y
            )
            if (isEatingApple) {
                return entity
            }
            return {
                ...entity,
                position: entity.position.slice(0, -1)
            }
        }

        // check if the snake  eating an apple, if yes move the apple
        if (entity.type === "apple" && entity.position) {
            const isEatingApple = entities.some(snake =>
                snake.id === "snake" && snake?.position?.[0]?.x === entity.position.x && snake?.position?.[0]?.y === entity.position.y
            )
            if (isEatingApple) {
                const snake = entities.find(entity2 => entity2.id === "snake")
                const result = getEmptyCells(snake.position)
                const rand = Math.floor(Math.random() * (result.length-1))
                return {
                    ...entity,
                    position: {
                        x: result[rand].x,
                        y: result[rand].y
                    }
                }
            }
        }
        return entity
    }
)



const collisionSystem = (entities, inputMaybe) => entities.map(
    entity => {
        // check if the snake is going outside the world
        if (entity.id === "settings") {
            const snake = entities.find(entity2 => entity2.id === "snake")
            const input = inputMaybe.getOrElse({nextDirections: [snake.direction]})
            //console.log(JSON.stringify(input))
            let test = input.nextDirections[0] ? input.nextDirections[0] : snake.direction
            // if the direction is not opposed to the current one
            if (test !== getOpposedDirection(snake.direction)) {
                const snakeNextPosition = getNextPosition(snake.position[0], test)

                const snakeOutOfWorld = snakeNextPosition.x < 0 || WORLD_WIDTH-1 < snakeNextPosition.x || snakeNextPosition.y < 0 || WORLD_HEIGHT-1 < snakeNextPosition.y
                const jammedSnake = snake.position.slice(1).filter((position) => position.x === snakeNextPosition.x && position.y === snakeNextPosition.y)

                //console.log(JSON.stringify(snake.position))
                //console.log(JSON.stringify(snakeNextPosition)+"  "+test)
                //console.log(JSON.stringify(jammedSnake))
                if (snakeOutOfWorld  || jammedSnake.length>0) {
                    //alert("stop")
                    return {
                        ...entity,
                        gameOn: false,
                        score: snake.position.length-snakeStart.length
                    }
                }
            }
            return {
                ...entity,
                score: snake.position.length-snakeStart.length
            }
        }
        return entity
    }
)



const renderSystem = (entities, canvasMonad, images) => {
    const settings = entities.find(entity2 => entity2.id === "settings")
    //alert(settings.gameOn)
    if (settings.gameOn) {
        canvasMonad.chain(
            canvas => {
                const ctx = canvasMonad.getContext('2d')
                drawBackgroundCells(canvasMonad)

                // draw the entities
                entities.map(
                    entity => {
                        if (entity.position) {
                            if (entity.sprite) {
                                ctx.drawImage(images[entity.sprite], ...convert(entity.position.x, entity.position.y))
                            } else {
                                ctx.fillStyle = entity.type === "snake" ? `rgb(71, 117, 235)` : "black"
                                for (let i = 0; i < entity.position.length; i++) {
                                    ctx.fillRect(...convert(entity.position[i].x, entity.position[i].y))
                                }
                            }
                        }
                        return entity
                    }
                )
                return CanvasMonad(canvas)
            }
        )
    }
    return entities
}










let entities;
let snakeStart = [{x: 7, y: 3},{x: 7, y: 2}]

function setupEntities() {
    const result = getEmptyCells(snakeStart)
    const rand = Math.floor(Math.random() * (result.length-1))
    return [
        entityCreator({
            id: "settings",
            type: "settings",
            difficulty: 250, // time (ms) between game loops
            gameOn: true,
            score: 0
        }),
        entityCreator({
            id: "snake",
            type: "snake",
            position: snakeStart,
            direction: "ArrowUp"
        }),
        entityCreator({
            id: "apple",
            type: "apple",
            sprite: "apple",
            position: {x: result[rand].x, y: result[rand].y}
        })
    ]
}

const images = {
    apple: new Image()
}
images.apple.alt = "apple_image"
images.apple.src = "apple.png"

let rawInput = {
    nextDirections: [] // an array containing the next direction commands.
}

let inputMaybe = Maybe(rawInput)
let canvas = document.getElementById("gameCanvas")
let canvasMonad = CanvasMonad(canvas)

const startButton = document.getElementById("startButton");


InputMonad(document).subscribe("keydown", e => {
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        rawInput.nextDirections.push(e.key)
    }
})

const gameUpdate = composeSystem([
    appleSystem,
    state => inputSystem(state, inputMaybe),
    state => collisionSystem(state, inputMaybe),
    state => renderSystem(state, canvasMonad, images),
])

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}









function gameLoop() {
    const settings = entities.find(entity => entity.id === "settings");
    if (settings.gameOn) {
        entities = gameUpdate(entities)
        document.getElementById("score").innerHTML = settings.score.toString();
        setTimeout(gameLoop, settings.difficulty)
    } else {
        const ctx = canvasMonad.getContext('2d')
        ctx.fillStyle = "black"
        ctx.font = "60px serif";
        ctx.fillText("Game Over", 2*CELL_SIZE, 9*CELL_SIZE)
        document.getElementById("startButton").disabled = false
    }
}

startButton.addEventListener("click", () => {
    entities = setupEntities()
    rawInput.nextDirections = []
    const settings = entities.find(entity => entity.id === "settings");
    settings.gameOn = true;
    settings.difficulty = Number(document.getElementById("difficulty").value)
    document.getElementById("startButton").disabled = true
    document.getElementById("score").innerHTML = "0"

    gameLoop();
});
drawBackgroundCells(canvasMonad)